<script lang="ts">
  import { onMount } from "svelte";
  import { locale, t } from "./lib/i18n";
  import * as tf from "@tensorflow/tfjs";
  import * as mobilenet from "@tensorflow-models/mobilenet";
  import * as knnClassifier from "@tensorflow-models/knn-classifier";
  import WebcamModal from "./lib/components/WebcamModal.svelte";
  import PreviewCard from "./lib/components/PreviewCard.svelte";

  let isReady = false;
  let classifier: knnClassifier.KNNClassifier;
  let net: mobilenet.MobileNet;
  let langOpen = false;
  let activeWebcamClass: number | null = null;

  const languages = [
    { code: 'pt', label: 'Português', short: 'PT' },
    { code: 'en', label: 'English',   short: 'EN' },
    { code: 'fr', label: 'Français',  short: 'FR' },
  ];

  let classes = [
    { id: 0, name: "Classe A", confidence: 0 },
    { id: 1, name: "Classe B", confidence: 0 }
  ];

  let isModelTrained = false;
  let isTrainingModel = false;
  let trainingError = "";
  let isLoadingModel = false;
  let trainingProgress = 0;
  let trainedCounts: { [key: number]: number } = {};
  let classCounter = 2;
  let previewUrl = "";
  // previewImgRef declared below near handlePreviewUpload

  // Guarda as fotos de cada classe
  let trainingImages: { [key: number]: string[] } = {};

  // Load saved class names from localStorage
  onMount(async () => {
    try {
      const saved = localStorage.getItem('aimachina_classes');
      if (saved) {
        const parsed = JSON.parse(saved);
        classes = parsed;
        classCounter = Math.max(...parsed.map((c: any) => c.id)) + 1;
      }
    } catch {}
    try {
      isLoadingModel = true;
      net = await mobilenet.load({ version: 1, alpha: 1.0 });
      classifier = knnClassifier.create();
      isReady = true;
    } catch (e) {
      console.error("Initialization error:", e);
    } finally {
      isLoadingModel = false;
    }
  });

  // Persist class names whenever they change
  $: if (classes) {
    try { localStorage.setItem('aimachina_classes', JSON.stringify(classes.map(c => ({ id: c.id, name: c.name, confidence: 0 })))); } catch {}
  }

  function handleWebcamCapture(event: CustomEvent<{ classId: number, images: string[] }>) {
    const { classId, images } = event.detail;
    if (!trainingImages[classId]) trainingImages[classId] = [];
    trainingImages[classId] = [...trainingImages[classId], ...images];
    activeWebcamClass = null;
    isModelTrained = false;
    stepTracker.completeStep("teach_machine");
  }

  async function handleClassUpload(event: Event, classId: number) {
    if (!isReady) return;
    const target = event.target as HTMLInputElement;
    const files = target.files;
    if (!files || files.length === 0) return;

    if (!trainingImages[classId]) trainingImages[classId] = [];

    // Reset status se houver alterações
    isModelTrained = false;

    for (let i = 0; i < files.length; i++) {
      const imgUrl = URL.createObjectURL(files[i]);
      trainingImages[classId] = [...trainingImages[classId], imgUrl];
    }
    trainingImages = { ...trainingImages };
  }

  function removeImage(classId: number, index: number) {
      const url = trainingImages[classId]?.[index];
      if (url) URL.revokeObjectURL(url);
      trainingImages[classId].splice(index, 1);
      trainingImages[classId] = [...trainingImages[classId]];
      trainingImages = { ...trainingImages };
      // Image removed: must full-retrain
      trainedCounts[classId] = 0;
      isModelTrained = false;
  }

  const trainModel = async () => {
     // Validate: at least 1 image per class
     const classesWithNoImages = classes.filter(c => !(trainingImages[c.id]?.length > 0));
     if (classesWithNoImages.length > 0) {
         trainingError = `Adicione pelo menos 1 imagem em cada classe (${classesWithNoImages.map(c => c.name).join(', ')}).`;
         return;
     }
     const total = classes.reduce((sum, c) => sum + (trainingImages[c.id]?.length || 0), 0);
     if (total < 3) {
         trainingError = $t("error_min_samples");
         return;
     }

     trainingError = "";
     isTrainingModel = true;
     trainingProgress = 0;

     // Detect if any class had images removed → need full retrain
     const needsFullRetrain = classes.some(c => (trainingImages[c.id]?.length || 0) < (trainedCounts[c.id] || 0));
     if (needsFullRetrain || classifier.getNumClasses() === 0) {
         classifier.dispose();
         classifier = knnClassifier.create();
         trainedCounts = {};
     }

     // Count only NEW images to process
     const newImages = classes.reduce((sum, c) => {
         const trained = trainedCounts[c.id] || 0;
         return sum + Math.max(0, (trainingImages[c.id]?.length || 0) - trained);
     }, 0);
     let processed = 0;

     for (const c of classes) {
         const imgs = trainingImages[c.id] || [];
         const startFrom = trainedCounts[c.id] || 0;
         for (let i = startFrom; i < imgs.length; i++) {
             const img = new Image();
             img.src = imgs[i];
             await new Promise<void>((resolve, reject) => {
               img.onload = () => resolve();
               img.onerror = () => reject(new Error('Failed to load image'));
               if (img.complete && img.naturalWidth > 0) resolve();
             }).catch(e => console.warn('[train] Skipped:', e));
             if (img.naturalWidth === 0) continue;
             const activation = net.infer(img, true);
             classifier.addExample(activation, c.id);
             activation.dispose();
             processed++;
             trainingProgress = Math.round((processed / newImages) * 100);
         }
         trainedCounts[c.id] = imgs.length;
     }

     isModelTrained = true;
     isTrainingModel = false;
     trainingProgress = 100;

     if (previewUrl) runPrediction();
  };

  // Pre-loaded reference so explain never races with DOM rendering
  let previewImgRef: HTMLImageElement | null = null;

  async function handlePreviewUpload(event: Event) {
    const target = event.target as HTMLInputElement;
    if (target.files && target.files.length > 0) {
      const file = target.files[0];
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      showExplanation = false;
      explanationDataUrl = "";
      previewUrl = URL.createObjectURL(file);
      // Eagerly load into a stable reference — avoids DOM race
      const img = new Image();
      img.src = previewUrl;
      await new Promise(r => img.onload = r);
      previewImgRef = img;
      if (isModelTrained) runPrediction();
    }
  }

  async function runPrediction() {
     if (!isReady || !previewImgRef || !isModelTrained) return;
     
     const numExamples = classes.reduce((sum, c) => sum + (trainingImages[c.id] ? trainingImages[c.id].length : 0), 0);
     let k = 1; 
     if (numExamples > 10) k = 3;
     if (numExamples > 20) k = 5;

     const activation = net.infer(previewImgRef, "conv_preds");
     const result = await classifier.predictClass(activation, k);
     activation.dispose();
     
     classes = classes.map(c => {
       const conf = result.confidences[c.id] || 0;
       return { ...c, confidence: Math.round(conf * 100) };
     });
  }

  function addClass() {
     const newId = classes.length > 0 ? Math.max(...classes.map(c => c.id)) + 1 : 0;
     const letter = String.fromCharCode(65 + (classCounter % 26)) + (classCounter >= 26 ? Math.floor(classCounter / 26) : '');
     classCounter++;
     classes = [...classes, { id: newId, name: `Classe ${letter}`, confidence: 0 }];
  }

  function removeClass(idToRemove: number) {
     // Revoke training image blob URLs before deletion
     (trainingImages[idToRemove] || []).forEach(url => URL.revokeObjectURL(url));
     classes = classes.filter(c => c.id !== idToRemove);
     delete trainingImages[idToRemove];
     delete trainedCounts[idToRemove]; // Bug fix: stale count would skip re-training
     trainingImages = { ...trainingImages };
     // Revoke test image blob URLs
     (testSamples[idToRemove] || []).forEach(url => URL.revokeObjectURL(url));
     delete testSamples[idToRemove];
     testSamples = { ...testSamples };
     isModelTrained = false;
     confusionMatrix = [];
     detailedResults = [];
  }

  // ─── XAI state ────────────────────────────────────────
  let isExplaining = false;
  let explanationDataUrl = "";
  let showExplanation = false;

  // ─── XAI helpers ──────────────────────────────────────
  // L2 distance between two Float32Array embeddings
  function embL2(a: Float32Array, b: Float32Array): number {
    let s = 0;
    for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2;
    return Math.sqrt(s);
  }

  // Percentile-robust normalise: squashes outliers, ensures contrast
  function robustNorm(vals: number[]): number[] {
    const sorted = [...vals].sort((a, b) => a - b);
    const n = sorted.length;
    const lo = sorted[Math.floor(n * 0.05)];
    const hi = sorted[Math.floor(n * 0.95)];
    const range = hi - lo + 1e-8;
    return vals.map(v => Math.max(0, Math.min(1, (v - lo) / range)));
  }

  // Core occlusion engine shared by both explain functions
  async function computeOcclusionMap(
    img: HTMLImageElement,
    IMG_SIZE = 224,
    PATCH = 80,  // larger patch = stronger signal through GAP layer
    STRIDE = 24  // 7x7 grid: floor((224-80)/24)+1 = 7
  ): Promise<{ heatNorm: number[][], steps: number }> {
    const STEPS = Math.floor((IMG_SIZE - PATCH) / STRIDE) + 1;

    const canvas = document.createElement('canvas');
    canvas.width = IMG_SIZE;
    canvas.height = IMG_SIZE;
    const ctx = canvas.getContext('2d')!;

    // --- Baseline embedding (no occlusion) ---
    ctx.drawImage(img, 0, 0, IMG_SIZE, IMG_SIZE);
    const baseTensor = net.infer(canvas, true) as import('@tensorflow/tfjs').Tensor;
    const baseEmb = new Float32Array(await baseTensor.data());
    baseTensor.dispose();

    // --- Occlusion grid: measure L2 distance from baseline embedding ---
    const heatmap: number[][] = Array.from({ length: STEPS }, () => Array(STEPS).fill(0));
    for (let row = 0; row < STEPS; row++) {
      for (let col = 0; col < STEPS; col++) {
        ctx.drawImage(img, 0, 0, IMG_SIZE, IMG_SIZE);
        // Use mean-grey patch (128,128,128) — neutral, avoids colour bias
        ctx.fillStyle = 'rgb(128,128,128)';
        ctx.fillRect(col * STRIDE, row * STRIDE, PATCH, PATCH);
        const occTensor = net.infer(canvas, true) as import('@tensorflow/tfjs').Tensor;
        const occEmb = new Float32Array(await occTensor.data());
        occTensor.dispose();
        // Higher L2 distance = covering this region changed the representation more = important
        heatmap[row][col] = embL2(baseEmb, occEmb);
      }
    }

    const flat = heatmap.flat();
    const normFlat = robustNorm(flat);
    const heatNorm: number[][] = Array.from({ length: STEPS }, (_, r) =>
      Array.from({ length: STEPS }, (__, c) => normFlat[r * STEPS + c])
    );
    return { heatNorm, steps: STEPS };
  }

  function renderOcclusionOverlay(
    img: HTMLImageElement,
    heatNorm: number[][],
    STEPS: number,
    IMG_SIZE = 224,
    PATCH = 80,
    STRIDE = 24
  ): string {
    const origW = img.naturalWidth  || img.width  || IMG_SIZE;
    const origH = img.naturalHeight || img.height || IMG_SIZE;
    const out = document.createElement('canvas');
    out.width  = origW;
    out.height = origH;
    const outCtx = out.getContext('2d')!;
    outCtx.drawImage(img, 0, 0, origW, origH);
    const sx = origW / IMG_SIZE;
    const sy = origH / IMG_SIZE;
    for (let row = 0; row < STEPS; row++) {
      for (let col = 0; col < STEPS; col++) {
        const n = heatNorm[row][col];
        // green(irrelevant) → yellow → red(important) with fixed alpha
        const r = Math.round(255 * Math.min(1, n * 2));
        const g = Math.round(255 * Math.max(0, 1 - n * 2));
        outCtx.fillStyle = `rgba(${r},${g},0,0.50)`;
        outCtx.fillRect(
          Math.round(col * STRIDE * sx), Math.round(row * STRIDE * sy),
          Math.round(PATCH * sx),        Math.round(PATCH * sy)
        );
      }
    }
    return out.toDataURL('image/jpeg', 0.92);
  }

  async function explainPrediction() {
    if (!isReady || !previewImgRef || !isModelTrained) return;
    isExplaining = true;
    showExplanation = false;
    explanationDataUrl = "";
    const { heatNorm, steps } = await computeOcclusionMap(previewImgRef);
    explanationDataUrl = renderOcclusionOverlay(previewImgRef, heatNorm, steps);
    showExplanation = true;
    isExplaining = false;
  }

  let testSamples: { [key: number]: string[] } = {};
  let confusionMatrix: number[][] = [];
  let isEvaluating = false;

  // Sample inspector — stores images per confusion matrix cell
  type SampleResult = { imgUrl: string; confidence: number; confRow: number; confCol: number };
  let detailedResults: SampleResult[][][] = []; // [realIdx][predIdx][]
  let inspectorCell: { rIdx: number; cIdx: number } | null = null;
  let inspectorExplainUrl = "";
  let inspectorExplainingIdx: number | null = null;
  let inspectorLastExplainedIdx: number | null = null; // tracks which thumbnail has the heatmap

  function removeTestImage(classId: number, index: number) {
    testSamples[classId].splice(index, 1);
    testSamples[classId] = [...testSamples[classId]];
    testSamples = { ...testSamples };
  }

  async function handleTestUpload(event: Event, classId: number) {
    const target = event.target as HTMLInputElement;
    const files = target.files;
    if (!files || files.length === 0) return;
    if (!testSamples[classId]) testSamples[classId] = [];
    
    for (let i = 0; i < files.length; i++) {
        testSamples[classId] = [...testSamples[classId], URL.createObjectURL(files[i])];
    }
    testSamples = { ...testSamples };
  }

  async function evaluateModel() {
     if (!isReady || !isModelTrained) return;
     isEvaluating = true;
     inspectorCell = null;
     inspectorExplainUrl = "";
     
     const size = classes.length;
     const classIndexMap: { [id: number]: number } = {};
     classes.forEach((c, i) => { classIndexMap[c.id] = i; });
     confusionMatrix = Array(size).fill(0).map(() => Array(size).fill(0));
     detailedResults = Array.from({ length: size }, () => Array.from({ length: size }, () => []));
     const numExamples = classes.reduce((sum, c) => sum + (trainingImages[c.id] ? trainingImages[c.id].length : 0), 0);
     // Bug fix: k must be <= total training examples, else KNN throws
     const k = Math.min(numExamples, numExamples >= 10 ? 5 : 3);

     for (const realClass of classes) {
         const realIdx = classIndexMap[realClass.id];
         const samples = testSamples[realClass.id] || [];
         for (const imgUrl of samples) {
             const img = new Image();
             img.src = imgUrl;
             await new Promise<void>((resolve, reject) => {
               img.onload = () => resolve();
               img.onerror = () => reject(new Error(`Failed to load: ${imgUrl}`));
               if (img.complete && img.naturalWidth > 0) resolve();
             }).catch(e => console.warn('[eval] Image skipped:', e));
             if (img.naturalWidth === 0) continue;
             const activation = net.infer(img, "conv_preds");
             const result = await classifier.predictClass(activation, k);
             activation.dispose();
             // Bug fix: result.label may not match any class id if classes were removed
             const predClassId = Number(result.label);
             const predIdx = classIndexMap[predClassId] ?? -1;
             if (predIdx < 0) continue; // orphaned prediction, skip
             const conf = Math.round((result.confidences[predClassId] || 0) * 100);
             confusionMatrix[realIdx][predIdx]++;
             detailedResults[realIdx][predIdx].push({ imgUrl, confidence: conf, confRow: realIdx, confCol: predIdx });
         }
     }
     confusionMatrix = [...confusionMatrix];
     detailedResults = [...detailedResults];
     isEvaluating = false;
  }

  async function explainInspectorImage(imgUrl: string, idx: number) {
    if (!isReady || !isModelTrained) return;
    inspectorExplainingIdx = idx;
    inspectorLastExplainedIdx = null; // clear previous while loading
    inspectorExplainUrl = "";
    const img = new Image();
    img.src = imgUrl;
    await new Promise(r => img.onload = r);
    const { heatNorm, steps } = await computeOcclusionMap(img);
    inspectorExplainUrl = renderOcclusionOverlay(img, heatNorm, steps);
    inspectorLastExplainedIdx = idx; // mark this thumbnail as having the heatmap
    inspectorExplainingIdx = null;
  }

  function exportModel() {
     const dataset = classifier.getClassifierDataset();
     const datasetObj: { [key: string]: number[] } = {};
     Object.keys(dataset).forEach((key) => {
       const data = dataset[key].dataSync();
       datasetObj[key] = Array.from(data);
     });
     
     const jsonStr = JSON.stringify(datasetObj);
     const blob = new Blob([jsonStr], { type: "application/json" });
     const url = URL.createObjectURL(blob);
     const a = document.createElement("a");
     a.href = url;
     a.download = "aimachina_model.json";
     a.click();
     URL.revokeObjectURL(url);
  }

  $: totalTestSamples = Object.values(testSamples).reduce((acc, arr) => acc + arr.length, 0);
</script>

<div class="min-h-screen bg-zinc-50 flex flex-col font-sans text-zinc-900 pb-20">

  <!-- Loading overlay while MobileNet initialises -->
  {#if isLoadingModel}
  <div class="fixed inset-0 z-[100] bg-white/90 backdrop-blur-sm flex flex-col items-center justify-center gap-4">
    <div class="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
    <p class="text-sm font-medium text-zinc-600">A carregar modelo MobileNet...</p>
  </div>
  {/if}

  <header class="bg-white border-b border-zinc-200 px-8 py-4 flex items-center justify-between sticky top-0 z-50 shadow-sm">
    <div class="flex items-center gap-3">
        <h1 class="text-xl font-bold tracking-tight text-zinc-900">AIMachina <span class="text-indigo-600">XLab</span></h1>
        {#if isModelTrained}
        <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
          <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
          {$t("trained_button")}
        </span>
        {/if}
    </div>
    <div class="flex gap-3 items-center">
        <!-- Custom language picker -->
        <div class="relative">
          <button
            on:click={() => langOpen = !langOpen}
            class="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-zinc-600 bg-zinc-100 border border-zinc-200 rounded-lg hover:bg-zinc-200 transition-colors"
          >
            <!-- Globe icon -->
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>
            <span>{languages.find(l => l.code === $locale)?.short ?? $locale.toUpperCase()}</span>
            <!-- Chevron -->
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="{langOpen ? '18 15 12 9 6 15' : '6 9 12 15 18 9'}"></polyline></svg>
          </button>

          {#if langOpen}
          <!-- svelte-ignore a11y-no-static-element-interactions -->
          <div class="absolute right-0 mt-1.5 w-40 bg-white border border-zinc-200 rounded-xl shadow-lg z-50 overflow-hidden py-1" on:mouseleave={() => langOpen = false}>
            {#each languages as lang}
            <button
              on:click={() => { $locale = lang.code; langOpen = false; }}
              class="w-full flex items-center gap-3 px-3 py-2 text-sm hover:bg-zinc-50 transition-colors {$locale === lang.code ? 'font-semibold text-indigo-600' : 'text-zinc-700'}"
            >
              <span class="font-mono text-xs w-6 text-center bg-zinc-100 rounded px-1 py-0.5">{lang.short}</span>
              <span>{lang.label}</span>
              {#if $locale === lang.code}
              <svg class="ml-auto" xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
              {/if}
            </button>
            {/each}
          </div>
          {/if}
        </div>
        <button on:click={exportModel} disabled={!isModelTrained} class="flex items-center gap-2 px-4 py-2 text-sm font-medium border border-zinc-200 rounded-md hover:bg-zinc-50 transition-colors disabled:opacity-40">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
            {$t("export_model")}
        </button>
    </div>
  </header>

  <main class="max-w-[85rem] mx-auto w-full px-8 mt-10 grid grid-cols-1 lg:grid-cols-12 gap-8">
    
    <section class="lg:col-span-8 flex flex-col gap-6">
        <!-- Step indicator -->
        <div class="flex items-center gap-0">
          {#each [
            { n: 1, label: $t('teach_machine'), active: true },
            { n: 2, label: $t('train_button'), active: isModelTrained || isTrainingModel },
            { n: 3, label: $t('test_machine'), active: !!previewUrl },
            { n: 4, label: $t('diagnostics'), active: confusionMatrix.length > 0 && confusionMatrix.some(row => row.some(v => v > 0)) }
          ] as step, i}
            <div class="flex items-center gap-2 {step.active ? 'text-zinc-800' : 'text-zinc-400'}">
              <span class="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 {step.active ? 'bg-indigo-600 text-white' : 'bg-zinc-200 text-zinc-400'}">{step.n}</span>
              <span class="text-xs font-medium hidden sm:block">{step.label}</span>
            </div>
            {#if i < 3}
            <div class="flex-1 max-w-8 h-px mx-2 {step.active ? 'bg-indigo-300' : 'bg-zinc-200'} shrink-0"></div>
            {/if}
          {/each}
        </div>

        <div class="flex items-center justify-between">
            <h2 class="text-lg font-semibold tracking-tight">{$t("teach_machine")}</h2>
        </div>

        <div class="grid grid-cols-1 gap-4">
            {#each classes as item}
            <div class="bg-white rounded-xl shadow-sm border border-zinc-200 overflow-hidden group hover:border-indigo-300 transition-colors">
                <div class="p-4 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/50 gap-3">
                    <input type="text" bind:value={item.name} class="font-medium text-zinc-700 bg-transparent outline-none w-full border-b border-transparent focus:border-indigo-400 transition-colors" />
                    {#if classes.length > 2}
                    <button on:click={() => removeClass(item.id)} class="text-zinc-400 hover:text-red-500 transition-colors" title="{$t('remove_class')}">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg>
                    </button>
                    {/if}
                </div>
                
                <!-- Galeria de Imagens Adicionada -->
                <div class="p-4 border-b border-zinc-100 bg-zinc-50/30 max-h-40 overflow-y-auto">
                    {#if trainingImages[item.id] && trainingImages[item.id].length > 0}
                        <div class="flex flex-wrap gap-2">
                        {#each trainingImages[item.id] as imgUrl, idx}
                            <div class="relative group/img w-12 h-12 rounded overflow-hidden border border-zinc-200">
                                <img src={imgUrl} class="w-full h-full object-cover" />
                                <button on:click={() => removeImage(item.id, idx)} class="absolute inset-0 bg-red-500/80 text-white opacity-0 group-hover/img:opacity-100 flex items-center justify-center transition-opacity">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                                </button>
                            </div>
                        {/each}
                        </div>
                    {:else}
                        <div class="flex flex-col items-center justify-center gap-3 py-6">
                            <span class="text-sm font-medium text-zinc-500">Add Image Samples:</span>
                            <div class="flex items-center gap-3 w-full max-w-xs">
                                <button on:click={() => activeWebcamClass = item.id} class="flex-1 flex flex-col items-center justify-center gap-2 h-16 bg-blue-50/50 hover:bg-blue-100/50 text-blue-600 rounded-lg border border-blue-100 transition-colors">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>
                                    <span class="text-xs font-semibold">Webcam</span>
                                </button>
                                <label class="flex-1 flex flex-col items-center justify-center gap-2 h-16 bg-blue-50/50 hover:bg-blue-100/50 text-blue-600 rounded-lg border border-blue-100 cursor-pointer transition-colors">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
                                    <span class="text-xs font-semibold">Upload</span>
                                    <input type="file" multiple accept="image/*" on:change={(e) => handleClassUpload(e, item.id)} class="hidden" />
                                </label>
                            </div>
                        </div>
                    {/if}
                </div>

                <div class="p-4 flex justify-between items-center gap-4 bg-zinc-50/30">
                    <div class="flex flex-col">
                        <span class="text-xl font-medium tracking-tight text-zinc-800">{trainingImages[item.id] ? trainingImages[item.id].length : 0}</span>
                        <span class="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">{$t("samples")}</span>
                    </div>
                    <div class="flex items-center gap-2">
                        <button on:click={() => activeWebcamClass = item.id} class="p-2 text-blue-600 hover:bg-blue-50 rounded-md transition-colors" title="Webcam">
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>
                        </button>
                        <label class="p-2 text-blue-600 hover:bg-blue-50 rounded-md cursor-pointer transition-colors" title="Upload">
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
                            <input type="file" multiple accept="image/*" on:change={(e) => handleClassUpload(e, item.id)} class="hidden" />
                        </label>
                    </div>
                </div>
            </div>
            {/each}

            <button on:click={addClass} class="bg-transparent border-2 border-dashed border-zinc-300 rounded-xl flex items-center justify-center gap-2 text-sm font-medium text-zinc-400 hover:text-indigo-600 hover:border-indigo-400 hover:bg-indigo-50/50 transition-all py-5">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                {$t("add_class")}
            </button>
        </div>

        <div class="mt-4 bg-white rounded-xl shadow-sm border border-zinc-200 overflow-hidden">
            {#if trainingError}
            <div class="px-6 py-3 bg-red-50 border-b border-red-100 flex items-center gap-2 text-sm text-red-700 font-medium">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
                {trainingError}
            </div>
            {/if}
            {#if isTrainingModel}
            <div class="px-6 pt-4 pb-0">
                <div class="flex justify-between text-xs font-medium text-zinc-500 mb-1.5">
                    <span>{$t("processing_images")}</span>
                    <span>{trainingProgress}%</span>
                </div>
                <div class="w-full bg-zinc-100 h-1.5 rounded-full overflow-hidden">
                    <div class="bg-indigo-500 h-full rounded-full transition-all duration-200" style="width:{trainingProgress}%"></div>
                </div>
            </div>
            {/if}
            <div class="p-6 flex items-center justify-between gap-4">
                <div>
                    <h3 class="text-base font-semibold mb-1">{$t("train_button")}</h3>
                    <p class="text-sm text-zinc-500 leading-relaxed">{$t("teach_desc")}</p>
                </div>
                <button on:click={trainModel} disabled={isTrainingModel} class="shrink-0 px-6 py-2.5 font-medium rounded-lg shadow-sm transition-all text-sm flex items-center gap-2 justify-center disabled:opacity-50 {isModelTrained && !isTrainingModel ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'bg-indigo-600 hover:bg-indigo-700 text-white'}">
                    {#if isTrainingModel}
                        <div class="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin"></div>
                        {$t("evaluating")}
                    {:else if isModelTrained}
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
                        {$t("trained_button")}
                    {:else}
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                        {$t("train_button")}
                    {/if}
                </button>
            </div>
        </div>
    </section>

    <aside class="lg:col-span-4 flex flex-col gap-6">
        <h2 class="text-lg font-semibold tracking-tight">{$t("test_machine")}</h2>
        <PreviewCard {net} {classifier} {classes} {isModelTrained}>
            <div class="bg-zinc-100 aspect-square relative flex items-center justify-center overflow-hidden border-b border-zinc-200">
                {#if showExplanation && explanationDataUrl}
                    <!-- svelte-ignore a11y-missing-attribute -->
                    <img src={explanationDataUrl} class="w-full h-full object-contain" />
                    <!-- Legend -->
                    <div class="absolute bottom-2 left-2 right-2 flex items-center gap-2 bg-black/60 rounded-md px-2 py-1.5 backdrop-blur-sm">
                        <div class="h-2 flex-1 rounded-full" style="background: linear-gradient(to right, rgba(0,200,30,0.85), rgba(255,165,0,0.85), rgba(255,30,30,0.9))"></div>
                        <span class="text-white text-[10px] font-medium shrink-0">{$t("heatmap_low")} → {$t("heatmap_high")}</span>
                    </div>
                {:else if previewUrl}
                    <!-- svelte-ignore a11y-missing-attribute -->
                    <img src={previewUrl} class="w-full h-full object-contain" />
                {:else}
                    <div class="flex flex-col items-center gap-2 text-center px-4">
                        <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="text-zinc-300"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
                        <p class="text-xs text-zinc-400 font-medium">{$t("test_desc")}</p>
                    </div>
                {/if}
                {#if isExplaining}
                    <div class="absolute inset-0 bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center gap-3">
                        <div class="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
                        <p class="text-xs font-medium text-zinc-600">{$t("explaining")}</p>
                    </div>
                {/if}
            </div>
            
            <div class="p-5 flex flex-col gap-4">
                <label class="w-full flex justify-between items-center px-4 py-2.5 text-sm border border-zinc-200 rounded-lg cursor-pointer hover:bg-zinc-50 hover:border-indigo-300 transition-all bg-zinc-50">
                    <span class="font-medium text-zinc-700">{$t("data_input")}</span>
                    <span class="text-indigo-600 font-semibold text-xs uppercase tracking-wide">{$t("browse")}</span>
                    <input type="file" accept="image/*" on:change={(e) => { showExplanation = false; handlePreviewUpload(e); }} class="hidden" />
                </label>

                <!-- XAI Explain Button -->
                {#if isModelTrained && previewUrl}
                <div class="border-t border-zinc-100 pt-4 flex flex-col gap-2">
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="text-xs font-semibold text-zinc-700">{$t("explanation_title")}</p>
                            <p class="text-xs text-zinc-400 mt-0.5">{$t("explanation_desc")}</p>
                        </div>
                    </div>
                    <div class="flex gap-2">
                        <button on:click={explainPrediction} disabled={isExplaining} class="flex-1 py-2 text-xs font-semibold bg-zinc-900 hover:bg-zinc-700 text-white rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5">
                            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line><line x1="11" y1="8" x2="11" y2="14"></line><line x1="8" y1="11" x2="14" y2="11"></line></svg>
                            {$t("explain_btn")}
                        </button>
                        {#if showExplanation}
                        <button on:click={() => showExplanation = false} class="px-3 py-2 text-xs font-medium border border-zinc-200 rounded-lg hover:bg-zinc-50 transition-colors text-zinc-600">
                            {$t("show_original")}
                        </button>
                        {/if}
                    </div>
                </div>
                {/if}
            </div>
        </PreviewCard>
    </aside>

  </main>

  {#if activeWebcamClass !== null}
    <WebcamModal 
      classId={activeWebcamClass} 
      className={classes.find(c => c.id === activeWebcamClass)?.name || "Class"} 
      on:capture={handleWebcamCapture}
      on:close={() => activeWebcamClass = null}
    />
  {/if}

  <section class="max-w-[85rem] mx-auto w-full px-8 mt-12">
    <div class="bg-white rounded-xl shadow-sm border border-zinc-200 overflow-hidden">
      
      <div class="bg-zinc-900 px-6 py-5 flex items-center justify-between">
         <div>
           <h2 class="text-base font-semibold tracking-tight text-white">{$t("diagnostics")}</h2>
           <p class="text-xs text-zinc-400 mt-0.5">{$t("diag_desc")}</p>
         </div>
         <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="text-zinc-500"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line></svg>
      </div>

      <div class="p-6 grid grid-cols-1 xl:grid-cols-12 gap-8">
         <div class="xl:col-span-4 flex flex-col gap-4">
            <div>
              <h3 class="text-sm font-semibold text-zinc-700">{$t("test_env")}</h3>
              <p class="text-xs text-zinc-500 leading-relaxed mt-1">{$t("test_env_desc")}</p>
            </div>
            
            <div class="flex flex-col gap-3">
                {#each classes as item}
                <div class="bg-zinc-50 rounded-lg border border-zinc-200 overflow-hidden">
                  <!-- Header row -->
                  <div class="px-3 py-2.5 flex justify-between items-center border-b border-zinc-200 bg-white">
                    <div>
                      <div class="text-sm font-semibold text-zinc-800">{item.name}</div>
                      <div class="text-xs text-zinc-400">{(testSamples[item.id] || []).length} {$t("samples")}</div>
                    </div>
                    <div class="flex gap-2">
                      <label class="flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 bg-zinc-100 border border-zinc-200 rounded cursor-pointer hover:border-indigo-300 hover:text-indigo-600 transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
                        {$t("upload_photos")}
                        <input type="file" multiple accept="image/*" on:change={(e) => handleTestUpload(e, item.id)} class="hidden" />
                      </label>
                    </div>
                  </div>
                  <!-- Thumbnail gallery -->
                  {#if testSamples[item.id] && testSamples[item.id].length > 0}
                  <div class="p-2 flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                    {#each testSamples[item.id] as imgUrl, idx}
                    <div class="relative group/timg w-10 h-10 rounded overflow-hidden border border-zinc-200 shrink-0">
                      <img src={imgUrl} class="w-full h-full object-cover" alt="test sample" />
                      <button on:click={() => removeTestImage(item.id, idx)} class="absolute inset-0 bg-red-500/80 text-white opacity-0 group-hover/timg:opacity-100 flex items-center justify-center transition-opacity">
                        <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                      </button>
                    </div>
                    {/each}
                  </div>
                  {:else}
                  <div class="px-3 py-2 text-xs text-zinc-400 italic">{$t("no_images")}</div>
                  {/if}
                </div>
                {/each}
            </div>

            <button on:click={evaluateModel} disabled={!isModelTrained || totalTestSamples === 0 || isEvaluating} class="w-full py-2.5 text-sm font-medium bg-zinc-800 hover:bg-zinc-900 text-white rounded-lg transition-colors disabled:opacity-40 flex items-center justify-center gap-2">
                {#if isEvaluating}
                  <div class="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin"></div>
                {/if}
                {isEvaluating ? $t("evaluating") : $t("run_diag")}
            </button>
         </div>

         <div class="xl:col-span-8 flex flex-col gap-4">
             <h3 class="text-sm font-semibold text-zinc-700">{$t("perf_dist")}</h3>
             
             {#if confusionMatrix.length > 0}
                 <div class="overflow-hidden border border-zinc-200 rounded-lg">
                     <table class="w-full text-sm text-left">
                         <thead class="bg-zinc-50 text-xs uppercase font-semibold text-zinc-500 border-b border-zinc-200">
                             <tr>
                                 <th class="px-4 py-3 border-r border-zinc-200">True Label \ Pred</th>
                                 {#each classes as c}
                                     <th class="px-4 py-3 border-r border-zinc-200 text-center">{c.name}</th>
                                 {/each}
                             </tr>
                         </thead>
                         <tbody class="divide-y divide-zinc-200 bg-white">
                             {#each classes as realClass, rIndex}
                                 <tr>
                                     <td class="px-4 py-3 font-medium text-zinc-700 border-r border-zinc-200 bg-zinc-50/30">{realClass.name}</td>
                                     {#each classes as predClass, cIndex}
                                         {@const count = confusionMatrix[rIndex][cIndex]}
                                         {@const isActive = inspectorCell?.rIdx === rIndex && inspectorCell?.cIdx === cIndex}
                                         <td
                                             class="px-4 py-3 text-center border-r border-zinc-200 font-medium transition-all
                                                 {count > 0 ? 'cursor-pointer' : ''}
                                                 {isActive ? 'ring-2 ring-inset ring-indigo-400' : ''}
                                                 {rIndex === cIndex && count > 0 ? 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100' : ''}
                                                 {rIndex !== cIndex && count > 0 ? 'bg-red-50 text-red-600 hover:bg-red-100' : ''}
                                                 {count === 0 ? 'text-zinc-300 font-normal' : ''}"
                                             on:click={() => { if(count > 0) { inspectorCell = { rIdx: rIndex, cIdx: cIndex }; inspectorExplainUrl = ""; } }}
                                         >
                                             {count}
                                         </td>
                                     {/each}
                                 </tr>
                             {/each}
                         </tbody>
                     </table>
                 </div>
                 <p class="text-xs text-zinc-500 leading-relaxed max-w-2xl bg-zinc-50 p-3 rounded border border-zinc-100">
                    {$t("matrix_note")} <span class="font-medium text-indigo-600">{$t("click_cell_hint")}</span>
                 </p>

                 <!-- Sample Inspector -->
                 {#if inspectorCell !== null && detailedResults.length > 0}
                 {@const cell = detailedResults[inspectorCell.rIdx]?.[inspectorCell.cIdx] ?? []}
                 {@const isCorrect = inspectorCell.rIdx === inspectorCell.cIdx}
                 <div class="border border-zinc-200 rounded-lg overflow-hidden">
                   <div class="px-4 py-3 {isCorrect ? 'bg-indigo-50 border-b border-indigo-100' : 'bg-red-50 border-b border-red-100'} flex items-center justify-between">
                     <div>
                       <p class="text-sm font-semibold {isCorrect ? 'text-indigo-800' : 'text-red-800'}">
                         {classes[inspectorCell.rIdx]?.name} → {classes[inspectorCell.cIdx]?.name}
                         <span class="ml-2 text-xs font-normal opacity-70">{isCorrect ? $t('sample_correct') : $t('sample_wrong')}</span>
                       </p>
                       <p class="text-xs opacity-60 mt-0.5">{cell.length} {$t('inspector_hint')}</p>
                     </div>
                     <button on:click={() => { inspectorCell = null; inspectorExplainUrl = ""; }} class="text-zinc-400 hover:text-zinc-600 transition-colors">
                       <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                     </button>
                   </div>

                   <div class="p-4 flex gap-4 flex-wrap bg-white">
                     {#each cell as sample, sIdx}
                     <div class="flex flex-col items-center gap-1.5">
                       <div class="relative group/s w-20 h-20 rounded-lg overflow-hidden border-2 {inspectorExplainingIdx === sIdx ? 'border-indigo-400' : 'border-zinc-200 hover:border-indigo-300'} cursor-pointer transition-colors"
                            on:click={() => explainInspectorImage(sample.imgUrl, sIdx)}>
                         {#if inspectorExplainUrl && inspectorCell && inspectorExplainingIdx === null && sIdx === inspectorLastExplainedIdx}
                           <img src={inspectorExplainUrl} class="w-full h-full object-cover" alt="heatmap" />
                         {:else}
                           <img src={sample.imgUrl} class="w-full h-full object-cover" alt="sample" />
                         {/if}
                         {#if inspectorExplainingIdx === sIdx}
                           <div class="absolute inset-0 bg-white/80 flex items-center justify-center">
                             <div class="w-5 h-5 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin"></div>
                           </div>
                         {:else}
                           <div class="absolute inset-0 bg-black/40 opacity-0 group-hover/s:opacity-100 flex items-center justify-center transition-opacity">
                             <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                           </div>
                         {/if}
                       </div>
                       <span class="text-xs font-semibold {isCorrect ? 'text-indigo-600' : 'text-red-500'}">{sample.confidence}%</span>
                     </div>
                     {/each}
                   </div>

                   {#if inspectorExplainUrl}
                   <div class="px-4 pb-4 bg-white border-t border-zinc-100">
                     <div class="relative rounded-lg overflow-hidden w-48 h-48">
                       <img src={inspectorExplainUrl} class="w-full h-full object-contain bg-zinc-100" alt="heatmap" />
                       <div class="absolute bottom-1 left-1 right-1 flex items-center gap-1.5 bg-black/60 rounded px-1.5 py-1 backdrop-blur-sm">
                         <div class="h-1.5 flex-1 rounded-full" style="background: linear-gradient(to right, rgba(0,200,30,0.85), rgba(255,165,0,0.85), rgba(255,30,30,0.9))"></div>
                         <span class="text-white text-[9px] font-medium shrink-0">← {$t("heatmap_low")} · {$t("heatmap_high")} →</span>
                       </div>
                     </div>
                     <button on:click={() => inspectorExplainUrl = ""} class="mt-2 text-xs text-zinc-400 hover:text-zinc-600 underline">{$t("hide_map")}</button>
                   </div>
                   {/if}
                 </div>
                 {/if}

             {:else}
                 <div class="h-44 bg-zinc-50/50 rounded-lg border border-dashed border-zinc-300 flex items-center justify-center text-sm font-medium text-zinc-400">
                     {$t("awaiting_samples")}
                 </div>
             {/if}
         </div>
      </div>
    </div>
  </section>


</div>
