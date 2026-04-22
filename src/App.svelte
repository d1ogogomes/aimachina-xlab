<script lang="ts">
  import { onMount } from "svelte";
  import { locale, t } from "./lib/i18n";
  import * as tf from "@tensorflow/tfjs";
  import * as mobilenet from "@tensorflow-models/mobilenet";
  import * as knnClassifier from "@tensorflow-models/knn-classifier";

  let isReady = false;
  let classifier: knnClassifier.KNNClassifier;
  let net: mobilenet.MobileNet;

  export let classes = [
    { id: 0, name: "Classe A", confidence: 0 },
    { id: 1, name: "Classe B", confidence: 0 }
  ];

  let isModelTrained = false;
  let isTrainingModel = false;
  let previewUrl = "";
  let previewImageElement: HTMLImageElement;

  // Guarda as fotos de cada classe
  let trainingImages: { [key: number]: string[] } = {};

  onMount(async () => {
    try {
      net = await mobilenet.load({ version: 1, alpha: 1.0 });
      classifier = knnClassifier.create();
      isReady = true;
    } catch (e) {
      console.error("Initialization error:", e);
    }
  });

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
      trainingImages[classId].splice(index, 1);
      trainingImages[classId] = [...trainingImages[classId]];
      trainingImages = { ...trainingImages };
      isModelTrained = false; // Necessita de re-treinar
  }

  const trainModel = async () => {
     const total = classes.reduce((sum, c) => sum + (trainingImages[c.id] ? trainingImages[c.id].length : 0), 0);
     if(total < 3) {
         alert("Dataset insufficient. Require at least 3 samples across the dataset for classification boundaries.");
         return;
     }
     
     isTrainingModel = true;
     
     // Recomeça limpo no KNN
     if (classifier.getNumClasses() > 0) {
         classifier.dispose();
         classifier = knnClassifier.create();
     }

     // Injectar todas as imagens na RAM de uma vez
     for (const c of classes) {
         const imgs = trainingImages[c.id] || [];
         for (const imgUrl of imgs) {
             const img = new Image();
             img.src = imgUrl;
             await new Promise(resolve => img.onload = resolve);
             const activation = net.infer(img, true);
             classifier.addExample(activation, c.id);
             activation.dispose();
         }
     }

     isModelTrained = true;
     isTrainingModel = false;
     
     if (previewUrl) {
         runPrediction();
     }
  };

  async function handlePreviewUpload(event: Event) {
    const target = event.target as HTMLInputElement;
    if (target.files && target.files.length > 0) {
      const file = target.files[0];
      previewUrl = URL.createObjectURL(file);
      setTimeout(() => {
          if (isModelTrained) runPrediction();
      }, 100);
    }
  }

  async function runPrediction() {
     if (!isReady || !previewImageElement || !isModelTrained) return;
     
     const numExamples = classes.reduce((sum, c) => sum + (trainingImages[c.id] ? trainingImages[c.id].length : 0), 0);
     let k = 1; 
     if (numExamples > 10) k = 3;
     if (numExamples > 20) k = 5;

     const activation = net.infer(previewImageElement, "conv_preds");
     const result = await classifier.predictClass(activation, k);
     activation.dispose();
     
     classes = classes.map(c => {
       const conf = result.confidences[c.id] || 0;
       return { ...c, confidence: Math.round(conf * 100) };
     });
  }

  function addClass() {
     const newId = classes.length > 0 ? Math.max(...classes.map(c => c.id)) + 1 : 0;
     classes = [...classes, { id: newId, name: `Classe ${String.fromCharCode(65 + classes.length)}`, confidence: 0 }];
  }

  function removeClass(idToRemove: number) {
     classes = classes.filter(c => c.id !== idToRemove);
     delete trainingImages[idToRemove];
     trainingImages = { ...trainingImages };
     delete testSamples[idToRemove];
     testSamples = { ...testSamples };
     isModelTrained = false;
  }

  let testSamples: { [key: number]: string[] } = {};
  let confusionMatrix: number[][] = [];
  let isEvaluating = false;

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
     
     const size = classes.length;
     confusionMatrix = Array(size).fill(0).map(() => Array(size).fill(0));
     const numExamples = classes.reduce((sum, c) => sum + (trainingImages[c.id] ? trainingImages[c.id].length : 0), 0);
     let k = numExamples >= 5 ? 5 : 3;

     for (const realClass of classes) {
         const samples = testSamples[realClass.id] || [];
         for (const imgUrl of samples) {
             const img = new Image();
             img.src = imgUrl;
             await new Promise(resolve => img.onload = resolve);
             const activation = net.infer(img, "conv_preds");
             const result = await classifier.predictClass(activation, k);
             activation.dispose();
             confusionMatrix[realClass.id][Number(result.label)]++;
         }
     }
     isEvaluating = false;
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
  
  <header class="bg-white border-b border-zinc-200 px-8 py-5 flex items-center justify-between sticky top-0 z-50">
    <div class="flex items-center gap-3">
        <h1 class="text-xl font-bold tracking-tight text-zinc-800">AIMachina XLab</h1>
    </div>
    <div class="flex gap-4 items-center">
        <select bind:value={$locale} class="bg-zinc-100 border border-zinc-200 text-sm rounded-md px-2 py-1 outline-none font-medium text-zinc-600">
            <option value="pt">🇵🇹 PT</option>
            <option value="en">🇬🇧 EN</option>
            <option value="fr">🇫🇷 FR</option>
        </select>
        <button on:click={exportModel} disabled={!isModelTrained} class="flex items-center gap-2 px-4 py-2 text-sm font-medium border border-zinc-200 rounded-md hover:bg-zinc-50 transition-colors disabled:opacity-40">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
            {$t("export_model")}
        </button>
    </div>
  </header>

  <main class="max-w-[85rem] mx-auto w-full px-8 mt-10 grid grid-cols-1 lg:grid-cols-12 gap-8">
    
    <section class="lg:col-span-8 flex flex-col gap-6">
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
                        <div class="text-xs text-zinc-400 italic">{$t("no_images")}</div>
                    {/if}
                </div>

                <div class="p-5 flex justify-between items-center gap-4">
                    <div class="flex flex-col">
                        <span class="text-2xl font-light tracking-tighter">{trainingImages[item.id] ? trainingImages[item.id].length : 0}</span>
                        <span class="text-xs font-medium text-zinc-400 uppercase tracking-wider">{$t("samples")}</span>
                    </div>
                    <label class="relative flex items-center justify-center gap-2 py-2 px-6 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-medium rounded text-sm cursor-pointer transition-colors border border-transparent hover:border-zinc-300">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
                        {$t("upload_photos")}
                        <input type="file" multiple accept="image/*" on:change={(e) => handleClassUpload(e, item.id)} class="hidden" />
                    </label>
                </div>
            </div>
            {/each}

            <button on:click={addClass} class="bg-transparent border border-dashed border-zinc-300 rounded-xl flex items-center justify-center text-sm font-medium text-zinc-500 hover:text-zinc-800 hover:border-zinc-400 hover:bg-zinc-50 transition-colors py-4">
                {$t("add_class")}
            </button>
        </div>

        <div class="mt-4 p-6 bg-white rounded-xl shadow-sm border border-zinc-200 flex items-center justify-between">
            <div>
                <h3 class="text-base font-semibold mb-1">{$t("train_button")}</h3>
                <p class="text-sm text-zinc-500 leading-relaxed">{$t("teach_desc")}</p>
            </div>
            <button on:click={trainModel} disabled={isTrainingModel} class="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-md shadow-sm transition-colors text-sm flex items-center gap-2 justify-center {isModelTrained && !isTrainingModel ? 'bg-indigo-900 border border-indigo-900' : ''} disabled:opacity-50">
                {#if isTrainingModel}
                    {$t("evaluating")}
                {:else if isModelTrained}
                    {$t("trained_button")}
                {:else}
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                    {$t("train_button")}
                {/if}
            </button>
        </div>
    </section>

    <aside class="lg:col-span-4 flex flex-col gap-6">
        <h2 class="text-lg font-semibold tracking-tight">{$t("test_machine")}</h2>
        
        <div class="bg-white rounded-xl shadow-sm border border-zinc-200 overflow-hidden flex flex-col">
            <div class="bg-zinc-100 aspect-square md:aspect-video lg:aspect-square relative flex items-center justify-center overflow-hidden border-b border-zinc-200">
                {#if previewUrl}
                    <!-- svelte-ignore a11y-missing-attribute -->
                    <img bind:this={previewImageElement} src={previewUrl} class="w-full h-full object-cover" />
                {:else}
                    <div class="text-xs text-zinc-400 font-medium text-center px-4">{$t("test_desc")}</div>
                {/if}
            </div>
            
            <div class="p-5 flex flex-col gap-5">
                <label class="w-full flex justify-between items-center px-4 py-2 text-sm border border-zinc-200 rounded-md cursor-pointer hover:bg-zinc-50 transition">
                    <span class="font-medium">{$t("data_input")}</span>
                    <span class="text-indigo-600 font-medium">{$t("browse")}</span>
                    <input type="file" accept="image/*" on:change={handlePreviewUpload} class="hidden" />
                </label>

                <div>
                    <h4 class="text-xs font-semibold uppercase text-zinc-500 tracking-wider mb-3">{$t("confidence")}</h4>
                    <div class="flex flex-col gap-3">
                        {#each classes as item}
                        <div class="w-full">
                            <div class="flex justify-between text-xs mb-1.5 font-medium">
                                <span class="text-zinc-700">{item.name}</span>
                                <span>{item.confidence}%</span>
                            </div>
                            <div class="w-full bg-zinc-100 h-2 rounded-full overflow-hidden">
                                <div class="bg-indigo-500 h-full transition-all duration-300" style="width: {item.confidence}%"></div>
                            </div>
                        </div>
                        {/each}
                    </div>
                </div>
            </div>
        </div>
    </aside>

  </main>

  <section class="max-w-[85rem] mx-auto w-full px-8 mt-12">
    <div class="bg-white rounded-xl shadow-sm border border-zinc-200 overflow-hidden">
      
      <div class="bg-zinc-50 border-b border-zinc-200 px-6 py-5 flex items-center gap-3">
         <h2 class="text-lg font-semibold tracking-tight text-zinc-800">{$t("diagnostics")}</h2>
      </div>

      <div class="p-6 grid grid-cols-1 xl:grid-cols-12 gap-8">
         <div class="xl:col-span-4 flex flex-col gap-5">
            <h3 class="text-sm font-semibold text-zinc-700">{$t("test_env")}</h3>
            <p class="text-xs text-zinc-500 leading-relaxed mb-1">{$t("test_env_desc")}</p>
            
            <div class="flex flex-col gap-2.5">
                {#each classes as item}
                <div class="bg-zinc-50 rounded border border-zinc-200 p-3 flex justify-between items-center group">
                   <div>
                       <div class="text-sm font-medium text-zinc-700">{item.name} Test Set</div>
                       <div class="text-xs text-zinc-400 mt-0.5">{(testSamples[item.id] || []).length} {$t("samples")}</div>
                   </div>
                   <label class="text-xs font-medium px-3 py-1.5 bg-white border border-zinc-200 rounded cursor-pointer hover:border-indigo-300 transition-colors">
                       {$t("upload_photos")}
                       <input type="file" multiple accept="image/*" on:change={(e) => handleTestUpload(e, item.id)} class="hidden" />
                   </label>
                </div>
                {/each}
            </div>

            <button on:click={evaluateModel} disabled={!isModelTrained || totalTestSamples === 0 || isEvaluating} class="mt-2 w-full py-2.5 text-sm font-medium bg-zinc-800 hover:bg-zinc-900 text-white rounded-md transition-colors disabled:opacity-40">
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
                                         <td class="px-4 py-3 text-center border-r border-zinc-200 font-medium
                                             {rIndex === cIndex && confusionMatrix[rIndex][cIndex] > 0 ? 'bg-indigo-50 text-indigo-700' : ''}
                                             {rIndex !== cIndex && confusionMatrix[rIndex][cIndex] > 0 ? 'bg-red-50 text-red-600' : ''}
                                             {confusionMatrix[rIndex][cIndex] === 0 ? 'text-zinc-300 font-normal' : ''}">
                                             {confusionMatrix[rIndex][cIndex]}
                                         </td>
                                     {/each}
                                 </tr>
                             {/each}
                         </tbody>
                     </table>
                 </div>
                 <p class="text-xs text-zinc-500 leading-relaxed max-w-2xl bg-zinc-50 p-3 rounded border border-zinc-100">
                    Observe the diagonal mappings for true positives. Off-diagonal elements identify bias and feature overlap between vector boundaries.
                 </p>
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
