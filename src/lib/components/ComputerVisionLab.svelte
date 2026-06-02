<script lang="ts">
  import { onMount } from "svelte";
  import { t } from "../i18n";
  import * as tf from "@tensorflow/tfjs";
  import type * as mobilenet from "@tensorflow-models/mobilenet";
  import WebcamModal from "./WebcamModal.svelte";
  import DrawModal from "./DrawModal.svelte";
  import PreviewCard from "./PreviewCard.svelte";
  import { demoDatasets } from "../demoDataset";
  import { mnistDatasets } from "../mnistDataset";
  import {
    loadImageFromUrl,
    embedPixels,
    buildClassifier,
    computeOcclusionMap,
    renderOcclusionOverlay,
  } from "../ml/tfjs";
  import { preprocessMnistCanvas } from "../ml/preprocess";
  import {
    buildDecisionTree,
    type TreeNode as DTNode,
  } from "../ml/decisionTree";
  import DecisionTreeViz from "./DecisionTreeViz.svelte";
  import { driver } from "driver.js";
  import "driver.js/dist/driver.css";

  // ─── Props (bridge to App shell) ──────────────────────────
  // `net` / `isReady` are owned by App (which loads the MobileNet backbone
  // once behind the global loading overlay) and passed down here.
  // `active` mirrors `activeTab === "cv"`: the component instance is kept
  // mounted so CV state survives tab switches, but its template is gated on
  // `active` so PreviewCard (and its webcam stream) unmounts when you leave.
  // `isModelTrained` is bound back up so the header can show the trained
  // badge and enable the Export button (which calls the exported
  // `exportModel()` below).
  export let net: mobilenet.MobileNet;
  export let isReady = false;
  export let active = false;
  export let isModelTrained = false;

  let customModel: tf.Sequential | null = null;
  let activeDemoDatasetType: "pets" | "mnist" | "custom" = "pets";
  let activeWebcamClass: number | null = null;
  let activeDrawClass: number | null = null;
  let activeTestWebcamClass: number | null = null;
  let activeTestDrawClass: number | null = null;

  // ─── Custom Datasets (session-only) ────────────────────────
  type CustomDatasetEntry = {
    name: string;
    classes: { id: number; name: string }[];
    trainingImages: { [key: number]: string[] };
    testSamples: { [key: number]: string[] };
  };
  let savedCustomDatasets: CustomDatasetEntry[] = [];
  let showSaveDatasetModal = false;
  let saveDatasetName = "";
  let saveDatasetError = "";

  let classes = [
    { id: 0, name: "Classe A", confidence: 0 },
    { id: 1, name: "Classe B", confidence: 0 },
  ];

  let isTrainingModel = false;
  let trainingError = "";
  let trainingProgress = 0;
  let classCounter = 2;
  let previewUrl = "";
  // previewImgRef declared below near handlePreviewUpload

  // Guarda as fotos de cada classe
  let trainingImages: { [key: number]: string[] } = {};
  let isDemoDatasetLoaded = false;
  let selectedDemoTestClassId = 0;
  let decisionTree: DTNode | null = null;

  // Stable class names reference — only updates when a name actually changes,
  // NOT on every confidence update. Prevents DecisionTreeViz from re-rendering
  // during the 60fps prediction loop.
  let _treeClassNames: string[] = classes.map((c) => c.name);
  $: {
    const next = classes.map((c) => c.name);
    if (
      next.length !== _treeClassNames.length ||
      next.some((n, i) => n !== _treeClassNames[i])
    ) {
      _treeClassNames = next;
    }
  }
  let savedEmbeddings: number[][] = [];
  let savedLabels: number[] = [];
  let isBuildingTree = false;

  /** Convert a blob: URL to a data: URL so it survives revocation. */
  function blobToDataUrl(url: string): Promise<string> {
    if (!url.startsWith("blob:")) return Promise.resolve(url);
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const c = document.createElement("canvas");
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        c.getContext("2d")!.drawImage(img, 0, 0);
        resolve(c.toDataURL("image/jpeg", 0.85));
      };
      img.onerror = () => reject(new Error("blob→dataUrl failed"));
      img.src = url;
    });
  }

  async function saveActiveCvDataset() {
    // No-op to avoid massive base64 image serialization in localStorage,
    // which causes severe performance degradation and QuotaExceededError.
    try {
      localStorage.removeItem("aimachina_active_cv_dataset");
    } catch {}
  }

  // Load saved active CV dataset or class names from localStorage
  onMount(async () => {
    try {
      const savedList = localStorage.getItem("aimachina_saved_custom_datasets");
      if (savedList) {
        const rawDatasets = JSON.parse(savedList);
        if (Array.isArray(rawDatasets)) {
          savedCustomDatasets = rawDatasets.map((ds: any) => {
            const trImages: { [key: number]: string[] } = {};
            const teSamples: { [key: number]: string[] } = {};
            if (ds.trainingImages) {
              for (const k in ds.trainingImages) {
                trImages[Number(k)] = ds.trainingImages[k];
              }
            }
            if (ds.testSamples) {
              for (const k in ds.testSamples) {
                teSamples[Number(k)] = ds.testSamples[k];
              }
            }
            return {
              name: ds.name || "",
              classes: ds.classes || [],
              trainingImages: trImages,
              testSamples: teSamples,
            };
          });
        }
      }
    } catch (e) {
      console.warn("Failed to load saved custom datasets:", e);
    }
    try {
      const savedActive = localStorage.getItem("aimachina_active_cv_dataset");
      if (savedActive) {
        const parsed = JSON.parse(savedActive);
        classes = parsed.classes || [];

        const rawTraining = parsed.trainingImages || {};
        trainingImages = {};
        for (const k in rawTraining) {
          trainingImages[Number(k)] = rawTraining[k];
        }

        const rawTest = parsed.testSamples || {};
        testSamples = {};
        for (const k in rawTest) {
          testSamples[Number(k)] = rawTest[k];
        }

        classCounter = parsed.classCounter ?? 2;
        activeDemoDatasetType = parsed.activeDemoDatasetType ?? "pets";
        isDemoDatasetLoaded = parsed.isDemoDatasetLoaded ?? false;
      } else {
        const saved = localStorage.getItem("aimachina_classes");
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) {
            classes = parsed;
            classCounter =
              parsed.length > 0 ? Math.max(...parsed.map((c: any) => c.id)) + 1 : 0;
          }
        }
      }
    } catch (e) {
      console.warn("Failed to load active CV dataset:", e);
    }
  });

  // Persist class names whenever the identity-bearing fields change.
  // Previously this reactive block fired on every live prediction (which
  // reassigns `classes` with fresh confidences), causing a JSON.stringify +
  // setItem storm per frame. Tracking a shallow signature of (id, name)
  // avoids the redundant writes.
  let lastPersistedSignature = "";
  $: if (classes && !isDemoDatasetLoaded) {
    const signature = JSON.stringify(classes.map((c) => [c.id, c.name]));
    if (signature !== lastPersistedSignature) {
      try {
        localStorage.setItem(
          "aimachina_classes",
          JSON.stringify(
            classes.map((c) => ({ id: c.id, name: c.name, confidence: 0 })),
          ),
        );
        lastPersistedSignature = signature;
        saveActiveCvDataset(); // Auto-save active dataset when a class is renamed
      } catch {}
    }
  }

  $: if (isDemoDatasetLoaded) {
    const targetDataset =
      activeDemoDatasetType === "mnist" ? mnistDatasets : demoDatasets;
    classes = targetDataset.map((dataset, id) => ({
      id,
      name: $t(dataset.labelKey),
      confidence: classes.find((c) => c.id === id)?.confidence ?? 0,
    }));
  }

  function handleWebcamCapture(
    event: CustomEvent<{ classId: number; images: string[] }>,
  ) {
    const { classId, images } = event.detail;
    if (!trainingImages[classId]) trainingImages[classId] = [];
    trainingImages[classId] = [...trainingImages[classId], ...images];
    trainingImages = { ...trainingImages };
    activeWebcamClass = null;
    invalidateTraining();
    saveActiveCvDataset();
  }

  function handleDrawCapture(
    event: CustomEvent<{ classId: number; images: string[] }>,
  ) {
    const { classId, images } = event.detail;
    if (!trainingImages[classId]) trainingImages[classId] = [];
    trainingImages[classId] = [...trainingImages[classId], ...images];
    trainingImages = { ...trainingImages };
    activeDrawClass = null;
    invalidateTraining();
    saveActiveCvDataset();
  }

  function handleTestWebcamCapture(
    event: CustomEvent<{ classId: number; images: string[] }>,
  ) {
    const { classId, images } = event.detail;
    if (!testSamples[classId]) testSamples[classId] = [];
    testSamples[classId] = [...testSamples[classId], ...images];
    testSamples = { ...testSamples };
    activeTestWebcamClass = null;
    saveActiveCvDataset();
  }

  function handleTestDrawCapture(
    event: CustomEvent<{ classId: number; images: string[] }>,
  ) {
    const { classId, images } = event.detail;
    if (!testSamples[classId]) testSamples[classId] = [];
    testSamples[classId] = [...testSamples[classId], ...images];
    testSamples = { ...testSamples };
    activeTestDrawClass = null;
    saveActiveCvDataset();
  }

  /**
   * Any mutation to the training set invalidates the trained model
   * and the last evaluation run. Centralized to avoid six hand-copies
   * that had already drifted apart.
   */
  function invalidateTraining() {
    isModelTrained = false;
    isDemoDatasetLoaded = false;
    confusionMatrix = [];
    detailedResults = [];
    decisionTree = null;
    savedEmbeddings = [];
    savedLabels = [];
  }

  function addTrainingFiles(files: FileList, classId: number) {
    if (!isReady) return;
    if (!files || files.length === 0) return;

    if (!trainingImages[classId]) trainingImages[classId] = [];

    const imageFiles = Array.from(files).filter((file) =>
      file.type.startsWith("image/"),
    );
    if (imageFiles.length === 0) return;

    invalidateTraining();

    for (const file of imageFiles) {
      const imgUrl = URL.createObjectURL(file);
      trainingImages[classId] = [...trainingImages[classId], imgUrl];
    }
    trainingImages = { ...trainingImages };
    saveActiveCvDataset();
  }

  async function handleClassUpload(event: Event, classId: number) {
    const target = event.target as HTMLInputElement;
    if (target.files) addTrainingFiles(target.files, classId);
    target.value = "";
  }

  function isObjectUrl(url: string) {
    return url.startsWith("blob:");
  }

  function revokeObjectUrls(urls: string[]) {
    urls.forEach((url) => {
      if (isObjectUrl(url)) URL.revokeObjectURL(url);
    });
  }

  // Monotonic token so rapid clicks between demo images can't commit
  // a stale HTMLImageElement. Each setPreviewImage captures the token
  // before awaiting and only assigns `previewImgRef` if it's still current.
  let previewToken = 0;

  async function setPreviewImage(src: string) {
    const token = ++previewToken;
    if (previewUrl && isObjectUrl(previewUrl)) URL.revokeObjectURL(previewUrl);
    showExplanation = false;
    explanationDataUrl = "";
    previewUrl = src;
    const img = await loadImageFromUrl(src);
    if (token !== previewToken) return; // superseded by a later click
    previewImgRef = img;
  }

  async function loadDemoDataset(type: "pets" | "mnist" = "pets") {
    activeDemoDatasetType = type;
    revokeObjectUrls(Object.values(trainingImages).flat());
    revokeObjectUrls(Object.values(testSamples).flat());
    if (previewUrl && isObjectUrl(previewUrl)) URL.revokeObjectURL(previewUrl);

    const targetDataset = type === "mnist" ? mnistDatasets : demoDatasets;

    customModel?.dispose();
    customModel = null;
    try {
      localStorage.removeItem("aimachina_classes");
    } catch {}
    classes = targetDataset.map((dataset, id) => ({
      id,
      name: $t(dataset.labelKey),
      confidence: 0,
    }));
    trainingImages = Object.fromEntries(
      targetDataset.map((dataset, id) => [
        id,
        dataset.training.map((sample) => sample.src),
      ]),
    );
    testSamples = Object.fromEntries(
      targetDataset.map((dataset, id) => [
        id,
        dataset.tests.map((sample) => sample.src),
      ]),
    );
    classCounter = targetDataset.length;
    selectedDemoTestClassId = 0;
    isDemoDatasetLoaded = true;
    isModelTrained = false;
    trainingError = "";
    trainingProgress = 0;
    confusionMatrix = [];
    detailedResults = [];
    inspectorCell = null;
    inspectorExplainUrl = "";
    inspectorExplainingIdx = null;
    inspectorLastExplainedIdx = null;
    activeWebcamClass = null;
    activeDrawClass = null;
    activeTestWebcamClass = null;
    activeTestDrawClass = null;

    try {
      await setPreviewImage(targetDataset[0].tests[0].src);
    } catch (e) {
      console.error("[demo] preview image failed:", e);
      previewImgRef = null;
    }
    saveActiveCvDataset();
  }

  // ─── Custom Dataset: Save & Load ──────────────────────────

  function openSaveDatasetModal() {
    const totalImages = Object.values(trainingImages).reduce(
      (s, a) => s + a.length,
      0,
    );
    if (classes.length < 2 || totalImages < 1) {
      saveDatasetError = $t("save_dataset_error_empty");
      showSaveDatasetModal = true;
      saveDatasetName = "";
      return;
    }
    saveDatasetError = "";
    saveDatasetName = "";
    showSaveDatasetModal = true;
  }

  async function confirmSaveDataset() {
    const name = saveDatasetName.trim();
    if (!name) {
      saveDatasetError = $t("save_dataset_error_name");
      return;
    }

    // Convert all blob URLs to data URLs so the snapshot is self-contained
    const snapTraining: { [key: number]: string[] } = {};
    const snapTest: { [key: number]: string[] } = {};
    for (const c of classes) {
      snapTraining[c.id] = await Promise.all(
        (trainingImages[c.id] || []).map(blobToDataUrl),
      );
      snapTest[c.id] = await Promise.all(
        (testSamples[c.id] || []).map(blobToDataUrl),
      );
    }

    savedCustomDatasets = [
      ...savedCustomDatasets,
      {
        name,
        classes: classes.map((c) => ({ id: c.id, name: c.name })),
        trainingImages: snapTraining,
        testSamples: snapTest,
      },
    ];
    try {
      localStorage.setItem("aimachina_saved_custom_datasets", JSON.stringify(savedCustomDatasets));
    } catch (e) {
      console.warn("Failed to save custom datasets:", e);
    }
    showSaveDatasetModal = false;
  }

  async function loadCustomDataset(index: number) {
    const ds = savedCustomDatasets[index];
    if (!ds) return;

    activeDemoDatasetType = "custom";
    revokeObjectUrls(Object.values(trainingImages).flat());
    revokeObjectUrls(Object.values(testSamples).flat());
    if (previewUrl && isObjectUrl(previewUrl)) URL.revokeObjectURL(previewUrl);

    customModel?.dispose();
    customModel = null;
    try {
      localStorage.removeItem("aimachina_classes");
    } catch {}

    classes = ds.classes.map((c) => ({ ...c, confidence: 0 }));
    trainingImages = {};
    for (const c of ds.classes) {
      trainingImages[c.id] = [...(ds.trainingImages[c.id] || [])];
    }
    testSamples = {};
    for (const c of ds.classes) {
      testSamples[c.id] = [...(ds.testSamples[c.id] || [])];
    }
    classCounter = ds.classes.length;
    selectedDemoTestClassId = 0;
    isDemoDatasetLoaded = false; // custom datasets are not "demo" datasets
    isModelTrained = false;
    trainingError = "";
    trainingProgress = 0;
    confusionMatrix = [];
    detailedResults = [];
    inspectorCell = null;
    inspectorExplainUrl = "";
    inspectorExplainingIdx = null;
    inspectorLastExplainedIdx = null;
    activeWebcamClass = null;
    activeDrawClass = null;
    activeTestWebcamClass = null;
    activeTestDrawClass = null;

    // Pick the first training image as preview if available
    const firstImgs = ds.trainingImages[ds.classes[0]?.id];
    if (firstImgs?.length) {
      try {
        await setPreviewImage(firstImgs[0]);
      } catch {
        previewImgRef = null;
      }
    } else {
      previewUrl = "";
      previewImgRef = null;
    }
    saveActiveCvDataset();
  }

  function deleteCustomDataset(index: number) {
    savedCustomDatasets = savedCustomDatasets.filter((_, i) => i !== index);
    try {
      localStorage.setItem("aimachina_saved_custom_datasets", JSON.stringify(savedCustomDatasets));
    } catch (e) {
      console.warn("Failed to save custom datasets:", e);
    }
  }

  async function selectDemoTestImage(classId: number, imgUrl: string) {
    selectedDemoTestClassId = classId;
    await setPreviewImage(imgUrl);
    if (isModelTrained) runPrediction();
  }

  function removeImage(classId: number, index: number) {
    const url = trainingImages[classId]?.[index];
    if (url && isObjectUrl(url)) URL.revokeObjectURL(url);
    trainingImages[classId].splice(index, 1);
    trainingImages[classId] = [...trainingImages[classId]];
    trainingImages = { ...trainingImages };
    invalidateTraining();
    saveActiveCvDataset();
  }

  async function extractEmbedding(
    source: HTMLImageElement | HTMLVideoElement,
  ): Promise<tf.Tensor2D> {
    return embedPixels(net, source);
  }

  const trainModel = async () => {
    // Re-entrancy guard: rapid double-click on the Train button can queue
    // two invocations before Svelte flips `disabled` on the DOM. Without
    // this check, two concurrent trainings build duplicate tensor graphs
    // and race on `customModel?.dispose()` in the catch branch.
    if (isTrainingModel) return;

    // Validate: at least 2 classes
    if (classes.length < 2) {
      trainingError = $t("error_min_classes");
      return;
    }

    // Validate: at least 1 image per class
    const classesWithNoImages = classes.filter(
      (c) => !(trainingImages[c.id]?.length > 0),
    );
    if (classesWithNoImages.length > 0) {
      trainingError = `Adicione pelo menos 1 imagem em cada classe (${classesWithNoImages.map((c) => c.name).join(", ")}).`;
      return;
    }
    const total = classes.reduce(
      (sum, c) => sum + (trainingImages[c.id]?.length || 0),
      0,
    );
    if (total < 3) {
      trainingError = $t("error_min_samples");
      return;
    }

    trainingError = "";
    isTrainingModel = true;
    trainingProgress = 0;
    confusionMatrix = [];
    detailedResults = [];

    const xs: tf.Tensor1D[] = [];
    const ys: number[] = [];
    const validCounts = new Map(classes.map((c) => [c.id, 0]));
    const classIndexMap = Object.fromEntries(classes.map((c, i) => [c.id, i]));
    let xDataset: tf.Tensor | undefined;
    let labelTensor: tf.Tensor1D | undefined;
    let yDataset: tf.Tensor | undefined;

    try {
      const totalImgs = total;
      let processed = 0;

      for (const c of classes) {
        const imgs = trainingImages[c.id] || [];
        for (const imgUrl of imgs) {
          try {
            const img = await loadImageFromUrl(imgUrl);
            const embedding = await extractEmbedding(img);
            xs.push(embedding.squeeze([0]) as tf.Tensor1D);
            embedding.dispose();
            ys.push(classIndexMap[c.id]);
            validCounts.set(c.id, (validCounts.get(c.id) || 0) + 1);
          } catch (e) {
            console.warn("[train] image skipped:", e);
          } finally {
            processed++;
            trainingProgress = Math.round((processed / totalImgs) * 50);
          }
        }
      }

      const classesWithNoValidImages = classes.filter(
        (c) => (validCounts.get(c.id) || 0) === 0,
      );
      if (classesWithNoValidImages.length > 0 || xs.length < 3) {
        trainingError =
          classesWithNoValidImages.length > 0
            ? `Não foi possível processar imagens válidas para: ${classesWithNoValidImages.map((c) => c.name).join(", ")}.`
            : $t("error_min_samples");
        return;
      }

      xDataset = tf.stack(xs) as tf.Tensor2D;
      labelTensor = tf.tensor1d(ys, "int32");
      yDataset = tf.oneHot(labelTensor, classes.length);

      customModel?.dispose();
      customModel = buildClassifier(classes.length);

      await customModel.fit(xDataset, yDataset, {
        batchSize: Math.min(32, Math.max(1, Math.floor(xs.length * 0.1))),
        epochs: 50,
        callbacks: {
          onEpochEnd: async (epoch) => {
            trainingProgress = 50 + Math.round(((epoch + 1) / 50) * 50);
            await tf.nextFrame();
          },
        },
      });

      isModelTrained = true;
      trainingProgress = 100;

      // Save raw embeddings for decision tree (built on demand)
      try {
        savedEmbeddings = [];
        for (const tensor of xs) {
          savedEmbeddings.push(Array.from(await tensor.data()));
        }
        savedLabels = [...ys];
      } catch (e) {
        console.warn("[train] failed to save embeddings:", e);
        savedEmbeddings = [];
        savedLabels = [];
      }

      if (previewUrl) runPrediction();
    } catch (e) {
      console.error("[train] model training failed:", e);
      trainingError =
        "O treino falhou. Verifique as imagens e tente novamente.";
      customModel?.dispose();
      customModel = null;
      isModelTrained = false;
    } finally {
      xDataset?.dispose();
      labelTensor?.dispose();
      yDataset?.dispose();
      xs.forEach((t) => t.dispose());
      isTrainingModel = false;
    }
  };

  // Pre-loaded reference so explain never races with DOM rendering
  let previewImgRef: HTMLImageElement | null = null;

  async function handlePreviewUpload(event: Event) {
    const target = event.target as HTMLInputElement;
    if (target.files && target.files.length > 0) {
      const file = target.files[0];
      if (previewUrl && isObjectUrl(previewUrl))
        URL.revokeObjectURL(previewUrl);
      showExplanation = false;
      explanationDataUrl = "";
      previewUrl = URL.createObjectURL(file);
      try {
        previewImgRef = await loadImageFromUrl(previewUrl);
        if (isModelTrained) runPrediction();
      } catch (e) {
        console.error("[preview] image load failed:", e);
        previewImgRef = null;
      }
    }
  }

  async function runPrediction() {
    if (!isReady || !previewImgRef || !isModelTrained || !customModel) return;

    let activation;
    try {
      activation = await extractEmbedding(previewImgRef);
      const predictions = customModel.predict(activation) as tf.Tensor;
      const confidences = await predictions.data();
      predictions.dispose();

      const classIndexMap = Object.fromEntries(
        classes.map((c, i) => [c.id, i]),
      );

      classes = classes.map((c) => {
        const conf = confidences[classIndexMap[c.id]] || 0;
        return { ...c, confidence: Math.round(conf * 100) };
      });
    } catch (e) {
      console.error("Live prediction error:", e);
    } finally {
      if (activation) activation.dispose();
    }
  }

  let showResetConfirm = false;

  function resetProject() {
    showResetConfirm = true;
  }

  function executeReset() {
    showResetConfirm = false;
    revokeObjectUrls(Object.values(trainingImages).flat());
    revokeObjectUrls(Object.values(testSamples).flat());
    if (previewUrl && isObjectUrl(previewUrl)) URL.revokeObjectURL(previewUrl);

    classes = [
      { id: 0, name: "Classe A", confidence: 0 },
      { id: 1, name: "Classe B", confidence: 0 },
    ];
    classCounter = 2;
    trainingImages = {};
    testSamples = {};
    isModelTrained = false;
    isTrainingModel = false;
    trainingProgress = 0;
    trainingError = "";
    previewUrl = "";
    previewImgRef = null;
    isDemoDatasetLoaded = false;
    // Reset demo-dataset selection state so the dataset chips, the test
    // class selector and the dataset-aware preprocess hook (MNIST vs pets)
    // all return to the initial values rather than referencing classes
    // that no longer exist.
    activeDemoDatasetType = "pets";
    selectedDemoTestClassId = 0;
    // Force the persistence reactive block to write a fresh signature on
    // the next class change rather than skipping it because the previous
    // signature still happens to match the freshly-reset classes.
    lastPersistedSignature = "";
    // Close any open capture modals/dropdowns left open from before reset.
    activeWebcamClass = null;
    activeDrawClass = null;
    activeTestWebcamClass = null;
    activeTestDrawClass = null;
    if (customModel) {
      customModel.dispose();
      customModel = null;
    }
    confusionMatrix = [];
    detailedResults = [];
    decisionTree = null;
    savedEmbeddings = [];
    savedLabels = [];
    isBuildingTree = false;
    isEvaluating = false;
    // Reset XAI state
    showExplanation = false;
    explanationDataUrl = "";
    isExplaining = false;
    inspectorCell = null;
    inspectorExplainUrl = "";
    inspectorExplainingIdx = null;
    inspectorLastExplainedIdx = null;
    try {
      localStorage.removeItem("aimachina_classes");
      localStorage.removeItem("aimachina_active_cv_dataset");
    } catch {}
  }

  function addClass() {
    const newId =
      classes.length > 0 ? Math.max(...classes.map((c) => c.id)) + 1 : 0;
    const letter =
      String.fromCharCode(65 + (classCounter % 26)) +
      (classCounter >= 26 ? Math.floor(classCounter / 26) : "");
    classCounter++;
    classes = [
      ...classes,
      { id: newId, name: `Classe ${letter}`, confidence: 0 },
    ];
    invalidateTraining();
    saveActiveCvDataset();
  }

  function removeClass(idToRemove: number) {
    // Revoke training image blob URLs before deletion
    (trainingImages[idToRemove] || []).forEach((url) => {
      if (isObjectUrl(url)) URL.revokeObjectURL(url);
    });
    classes = classes.filter((c) => c.id !== idToRemove);
    delete trainingImages[idToRemove];
    trainingImages = { ...trainingImages };
    // Revoke test image blob URLs
    revokeObjectUrls(testSamples[idToRemove] || []);
    delete testSamples[idToRemove];
    testSamples = { ...testSamples };
    invalidateTraining();
    saveActiveCvDataset();
  }

  // ─── XAI state ────────────────────────────────────────
  let isExplaining = false;
  let explanationDataUrl = "";
  let showExplanation = false;

  // XAI helpers (occlusion map + overlay rendering) live in lib/ml/tfjs.
  // They batch all occlusion inferences into a single forward pass,
  // which is ~1 order of magnitude faster than the previous serial loop.

  async function explainPrediction() {
    if (!isReady || !previewImgRef || !isModelTrained) return;
    isExplaining = true;
    showExplanation = false;
    explanationDataUrl = "";
    try {
      const result = await computeOcclusionMap(net, previewImgRef);
      explanationDataUrl = renderOcclusionOverlay(previewImgRef, result);
      showExplanation = true;
    } catch (e) {
      console.error("[XAI] explain failed:", e);
    } finally {
      isExplaining = false;
    }
  }

  let testSamples: { [key: number]: string[] } = {};
  let confusionMatrix: number[][] = [];
  let isEvaluating = false;

  // Sample inspector — stores images per confusion matrix cell
  type SampleResult = {
    imgUrl: string;
    confidence: number;
    confRow: number;
    confCol: number;
  };
  let detailedResults: SampleResult[][][] = []; // [realIdx][predIdx][]
  let inspectorCell: { rIdx: number; cIdx: number } | null = null;
  let inspectorExplainUrl = "";
  let inspectorExplainingIdx: number | null = null;
  let inspectorLastExplainedIdx: number | null = null; // tracks which thumbnail has the heatmap

  function removeTestImage(classId: number, index: number) {
    const url = testSamples[classId]?.[index];
    if (url && isObjectUrl(url)) URL.revokeObjectURL(url);
    testSamples[classId].splice(index, 1);
    testSamples[classId] = [...testSamples[classId]];
    testSamples = { ...testSamples };
    saveActiveCvDataset();
  }

  async function handleTestUpload(event: Event, classId: number) {
    const target = event.target as HTMLInputElement;
    const files = target.files;
    if (!files || files.length === 0) return;
    if (!testSamples[classId]) testSamples[classId] = [];

    for (let i = 0; i < files.length; i++) {
      if (!files[i].type.startsWith("image/")) continue;
      testSamples[classId] = [
        ...testSamples[classId],
        URL.createObjectURL(files[i]),
      ];
    }
    testSamples = { ...testSamples };
    saveActiveCvDataset();
  }

  async function evaluateModel() {
    const model = customModel;
    if (!isReady || !isModelTrained || !model) return;
    isEvaluating = true;
    inspectorCell = null;
    inspectorExplainUrl = "";

    const size = classes.length;
    const classIndexMap: { [id: number]: number } = {};
    classes.forEach((c, i) => {
      classIndexMap[c.id] = i;
    });
    confusionMatrix = Array(size)
      .fill(0)
      .map(() => Array(size).fill(0));
    detailedResults = Array.from({ length: size }, () =>
      Array.from({ length: size }, () => []),
    );
    for (const realClass of classes) {
      const realIdx = classIndexMap[realClass.id];
      const samples = testSamples[realClass.id] || [];
      for (const imgUrl of samples) {
        let activation;
        try {
          const img = await loadImageFromUrl(imgUrl);
          activation = await extractEmbedding(img);
          const predictions = model.predict(activation) as tf.Tensor;
          const confidences = await predictions.data();
          predictions.dispose();

          let bestIdx = 0;
          let bestConf = -1;
          for (let i = 0; i < classes.length; i++) {
            if (confidences[i] > bestConf) {
              bestConf = confidences[i];
              bestIdx = i;
            }
          }

          const predIdx = bestIdx;
          if (predIdx >= 0) {
            const conf = Math.round(confidences[bestIdx] * 100);
            confusionMatrix[realIdx][predIdx]++;
            detailedResults[realIdx][predIdx].push({
              imgUrl,
              confidence: conf,
              confRow: realIdx,
              confCol: predIdx,
            });
          }
        } catch (e) {
          console.error("Evaluation prediction error:", e);
        } finally {
          if (activation) activation.dispose();
        }
      }
    }
    confusionMatrix = [...confusionMatrix];
    detailedResults = [...detailedResults];
    isEvaluating = false;
  }

  async function buildTreeDiagnostic() {
    if (!isModelTrained || savedEmbeddings.length === 0) return;
    isBuildingTree = true;
    await new Promise((r) => setTimeout(r, 50)); // let UI update
    try {
      decisionTree = buildDecisionTree(
        savedEmbeddings,
        savedLabels,
        classes.length,
        3,
        1,
      );
    } catch (e) {
      console.error("[dtree] build failed:", e);
      decisionTree = null;
    }
    isBuildingTree = false;
  }

  async function explainInspectorImage(imgUrl: string, idx: number) {
    if (!isReady || !isModelTrained) return;
    inspectorExplainingIdx = idx;
    inspectorLastExplainedIdx = null;
    inspectorExplainUrl = "";
    try {
      const img = await loadImageFromUrl(imgUrl);
      const result = await computeOcclusionMap(net, img);
      inspectorExplainUrl = renderOcclusionOverlay(img, result);
      inspectorLastExplainedIdx = idx;
    } catch (e) {
      console.error("[XAI] Inspector explain failed:", e);
    } finally {
      inspectorExplainingIdx = null;
    }
  }

  // Exposed to App so the shared header's Export button can trigger a save.
  export function exportModel() {
    if (!customModel) return;
    customModel
      .save("downloads://aimachina-model")
      .catch((e) => console.error("Export error:", e));
  }

  // Exposed to App so the onboarding flow / help button can launch the
  // guided tour. Steps are rebuilt on every call so the popovers always
  // reflect the language active at launch time. The caller is responsible
  // for switching to the CV tab and awaiting `tick()` first, since the
  // target elements only exist while this lab's template is rendered.
  export function startTour() {
    driver({
      showProgress: true,
      popoverClass: "aimachina-tour",
      nextBtnText: $t("tour_btn_next"),
      prevBtnText: $t("tour_btn_prev"),
      doneBtnText: $t("tour_btn_done"),
      steps: [
        {
          element: "#cv-step-indicator",
          popover: {
            title: $t("tour_step1_title"),
            description: $t("tour_step1_desc"),
          },
        },
        {
          element: "#cv-dataset-actions",
          popover: {
            title: $t("tour_step2_title"),
            description: $t("tour_step2_desc"),
          },
        },
        {
          element: "#cv-classes-container",
          popover: {
            title: $t("tour_step3_title"),
            description: $t("tour_step3_desc"),
          },
        },
        {
          element: "#cv-train-card",
          popover: {
            title: $t("tour_step4_title"),
            description: $t("tour_step4_desc"),
          },
        },
        {
          element: "#cv-preview-card",
          popover: {
            title: $t("tour_step5_title"),
            description: $t("tour_step5_desc"),
          },
        },
      ],
    }).drive();
  }

  $: totalTestSamples = Object.values(testSamples).reduce(
    (acc, arr) => acc + arr.length,
    0,
  );
  $: totalTrainingSamples = Object.values(trainingImages).reduce(
    (acc, arr) => acc + arr.length,
    0,
  );
  $: canTrain =
    totalTrainingSamples >= 3 &&
    classes.every((c) => (trainingImages[c.id]?.length || 0) > 0);

  // ─── Per-class metrics derived from confusion matrix ─────────
  type ClassMetrics = {
    precision: number;
    recall: number;
    f1: number;
    support: number;
  };
  $: classMetrics = (() => {
    if (confusionMatrix.length === 0) return [] as ClassMetrics[];
    const n = confusionMatrix.length;
    return Array.from({ length: n }, (_, i) => {
      const tp = confusionMatrix[i][i];
      let fp = 0,
        fn = 0;
      for (let j = 0; j < n; j++) {
        if (j !== i) {
          fp += confusionMatrix[j][i];
          fn += confusionMatrix[i][j];
        }
      }
      const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
      const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
      const f1 =
        precision + recall > 0
          ? (2 * precision * recall) / (precision + recall)
          : 0; // 2 * (precision * recall) / (precision + recall)
      const support = tp + fn; // total real samples for this class
      return { precision, recall, f1, support } as ClassMetrics;
    });
  })();

  $: globalAccuracy = (() => {
    if (confusionMatrix.length === 0) return 0;
    let diagonal = 0,
      total = 0;
    for (let i = 0; i < confusionMatrix.length; i++)
      for (let j = 0; j < confusionMatrix[i].length; j++) {
        total += confusionMatrix[i][j];
        if (i === j) diagonal += confusionMatrix[i][j];
      }
    return total > 0 ? diagonal / total : 0;
  })();
</script>

{#if active}
  <main
    class="max-w-[85rem] mx-auto w-full px-8 mt-10 grid grid-cols-1 lg:grid-cols-12 gap-8 relative z-10"
  >
    <section class="lg:col-span-8 flex flex-col gap-6">
      <!-- Step indicator -->
      <div id="cv-step-indicator" class="flex items-center gap-0">
        {#each [{ n: 1, label: $t("teach_machine"), active: true }, { n: 2, label: $t("train_button"), active: isModelTrained || isTrainingModel }, { n: 3, label: $t("test_machine"), active: isModelTrained }, { n: 4, label: $t("diagnostics"), active: confusionMatrix.length > 0 && confusionMatrix.some( (row) => row.some((v) => v > 0), ) }, { n: 5, label: $t("dtree_title"), active: decisionTree !== null }] as step, i}
          <div
            class="flex items-center gap-2 {step.active
              ? 'text-zinc-800'
              : 'text-zinc-400'}"
          >
            <span
              class="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 {step.active
                ? 'bg-indigo-600 text-white'
                : 'bg-zinc-200 text-zinc-400'}">{step.n}</span
            >
            <span class="text-xs font-medium hidden sm:block"
              >{step.label}</span
            >
          </div>
          {#if i < 4}
            <div
              class="flex-1 max-w-8 h-px mx-2 {step.active
                ? 'bg-indigo-300'
                : 'bg-zinc-200'} shrink-0"
            ></div>
          {/if}
        {/each}
      </div>

      <div class="flex items-center justify-between mb-4">
        <h2 class="text-lg font-semibold tracking-tight">
          {$t("teach_machine")}
        </h2>
        <div id="cv-dataset-actions" class="flex items-center gap-2 flex-wrap">
          <button
            on:click={() => loadDemoDataset("pets")}
            class="text-sm font-semibold text-indigo-700 bg-white border border-indigo-100 hover:border-indigo-300 hover:bg-indigo-50 px-3 py-1.5 rounded-lg transition-all flex items-center gap-2 shadow-sm"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              ><path
                d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"
              ></path></svg
            >
            Demo (Animais)
          </button>
          <button
            on:click={() => loadDemoDataset("mnist")}
            class="text-sm font-semibold text-teal-700 bg-white border border-teal-100 hover:border-teal-300 hover:bg-teal-50 px-3 py-1.5 rounded-lg transition-all flex items-center gap-2 shadow-sm"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              ><path
                d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"
              ></path></svg
            >
            Demo (MNIST)
          </button>
          {#each savedCustomDatasets as cds, cdsIdx}
            <div class="relative group/cds">
              <button
                on:click={() => loadCustomDataset(cdsIdx)}
                class="text-sm font-semibold text-amber-700 bg-white border border-amber-100 hover:border-amber-300 hover:bg-amber-50 px-3 py-1.5 rounded-lg transition-all flex items-center gap-2 shadow-sm"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.5"
                  ><path
                    d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"
                  /><polyline points="17 21 17 13 7 13 7 21" /><polyline
                    points="7 3 7 8 15 8 15 3"
                  /></svg
                >
                {cds.name}
              </button>
              <button
                on:click={() => deleteCustomDataset(cdsIdx)}
                class="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center opacity-0 group-hover/cds:opacity-100 transition-opacity shadow-sm hover:bg-red-600"
                aria-label="Delete dataset"
              >
                ×
              </button>
            </div>
          {/each}
          <button
            on:click={openSaveDatasetModal}
            class="text-sm font-semibold text-zinc-500 bg-white border border-dashed border-zinc-300 hover:border-zinc-400 hover:text-zinc-700 hover:bg-zinc-50 px-3 py-1.5 rounded-lg transition-all flex items-center gap-2"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              ><line x1="12" y1="5" x2="12" y2="19"></line><line
                x1="5"
                y1="12"
                x2="19"
                y2="12"
              ></line></svg
            >
            {$t("create_dataset")}
          </button>
        </div>
      </div>

      <div id="cv-classes-container" class="grid grid-cols-1 gap-4">
        {#each classes as item}
          <div
            class="bg-white/70 backdrop-blur-md rounded-2xl border border-white/60 shadow-[0_8px_30px_rgba(0,0,0,0.02)] overflow-hidden group hover:border-indigo-300/80 transition-all duration-300"
          >
            <div
              class="p-4 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/50 gap-3"
            >
              <input
                type="text"
                bind:value={item.name}
                class="font-medium text-zinc-700 bg-transparent outline-none w-full border-b border-transparent focus:border-indigo-400 transition-colors"
              />
              {#if classes.length > 2}
                <button
                  on:click={() => removeClass(item.id)}
                  class="text-zinc-400 hover:text-red-500 transition-colors"
                  title={$t("remove_class")}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    ><path d="M3 6h18"></path><path
                      d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"
                    ></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"
                    ></path></svg
                  >
                </button>
              {/if}
            </div>

            <!-- Galeria de Imagens Adicionada -->
            <div
              class="p-4 border-b border-zinc-100 bg-zinc-50/30 max-h-40 overflow-y-auto"
            >
              {#if trainingImages[item.id] && trainingImages[item.id].length > 0}
                <div class="flex flex-wrap gap-2">
                  {#each trainingImages[item.id] as imgUrl, idx}
                    <div
                      class="relative group/img w-12 h-12 rounded overflow-hidden border border-zinc-200"
                    >
                      <img
                        src={imgUrl}
                        class="w-full h-full object-cover"
                        alt="training sample"
                      />
                      <button
                        on:click={() => removeImage(item.id, idx)}
                        class="absolute inset-0 bg-red-500/80 text-white opacity-0 group-hover/img:opacity-100 flex items-center justify-center transition-opacity"
                        aria-label="Remove training sample"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="12"
                          height="12"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="3"
                          ><line x1="18" y1="6" x2="6" y2="18"></line><line
                            x1="6"
                            y1="6"
                            x2="18"
                            y2="18"
                          ></line></svg
                        >
                      </button>
                    </div>
                  {/each}
                </div>
              {:else}
                <div
                  class="flex flex-col items-center justify-center gap-3 py-6"
                >
                  <span class="text-sm font-medium text-zinc-500"
                    >{$t("add_image_samples")}</span
                  >
                  <div class="flex items-center gap-3 w-full max-w-sm">
                    <button
                      on:click={() => (activeWebcamClass = item.id)}
                      class="flex-1 flex flex-col items-center justify-center gap-2 h-16 bg-blue-50/50 hover:bg-blue-100/50 text-blue-600 rounded-lg border border-blue-100 transition-colors"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        ><path
                          d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"
                        ></path><circle cx="12" cy="13" r="4"></circle></svg
                      >
                      <span class="text-xs font-semibold">{$t("webcam")}</span
                      >
                    </button>
                    <button
                      on:click={() => (activeDrawClass = item.id)}
                      class="flex-1 flex flex-col items-center justify-center gap-2 h-16 bg-blue-50/50 hover:bg-blue-100/50 text-blue-600 rounded-lg border border-blue-100 transition-colors"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        ><path d="M12 20h9" /><path
                          d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"
                        /></svg
                      >
                      <span class="text-xs font-semibold">{$t("canvas")}</span
                      >
                    </button>
                    <label
                      class="flex-1 flex flex-col items-center justify-center gap-2 h-16 bg-blue-50/50 hover:bg-blue-100/50 text-blue-600 rounded-lg border border-blue-100 cursor-pointer transition-colors"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        ><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"
                        ></path><polyline points="17 8 12 3 7 8"
                        ></polyline><line x1="12" y1="3" x2="12" y2="15"
                        ></line></svg
                      >
                      <span class="text-xs font-semibold"
                        >{$t("upload_photos")}</span
                      >
                      <input
                        type="file"
                        multiple
                        accept="image/*"
                        on:change={(e) => handleClassUpload(e, item.id)}
                        class="hidden"
                      />
                    </label>
                  </div>
                </div>
              {/if}
            </div>

            <div
              class="p-4 flex justify-between items-center gap-4 bg-zinc-50/30"
            >
              <div class="flex flex-col">
                <span class="text-xl font-medium tracking-tight text-zinc-800"
                  >{trainingImages[item.id]
                    ? trainingImages[item.id].length
                    : 0}</span
                >
                <span
                  class="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider"
                  >{$t("samples")}</span
                >
              </div>
              <div class="flex items-center gap-2">
                <button
                  on:click={() => (activeWebcamClass = item.id)}
                  class="p-2 text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                  title="Webcam"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    ><path
                      d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"
                    ></path><circle cx="12" cy="13" r="4"></circle></svg
                  >
                </button>
                <button
                  on:click={() => (activeDrawClass = item.id)}
                  class="p-2 text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                  title={$t("canvas")}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    ><path d="M12 20h9" /><path
                      d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"
                    /></svg
                  >
                </button>
                <label
                  class="p-2 text-blue-600 hover:bg-blue-50 rounded-md cursor-pointer transition-colors"
                  title="Upload"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    ><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"
                    ></path><polyline points="17 8 12 3 7 8"></polyline><line
                      x1="12"
                      y1="3"
                      x2="12"
                      y2="15"
                    ></line></svg
                  >
                  <input
                    type="file"
                    multiple
                    accept="image/*"
                    on:change={(e) => handleClassUpload(e, item.id)}
                    class="hidden"
                  />
                </label>
              </div>
            </div>
          </div>
        {/each}

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
          <button
            on:click={addClass}
            class="bg-transparent border-2 border-dashed border-zinc-300 rounded-xl flex items-center justify-center gap-2 text-sm font-medium text-zinc-400 hover:text-indigo-600 hover:border-indigo-400 hover:bg-indigo-50/50 transition-all py-4"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              ><line x1="12" y1="5" x2="12" y2="19"></line><line
                x1="5"
                y1="12"
                x2="19"
                y2="12"
              ></line></svg
            >
            {$t("add_class")}
          </button>
          <button
            on:click={resetProject}
            class="bg-white border border-red-200 rounded-xl flex items-center justify-center gap-2 text-sm font-medium text-red-500 hover:border-red-400 hover:bg-red-50/60 hover:text-red-600 transition-all py-4 shadow-sm"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              ><path d="M3 6h18"></path><path
                d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"
              ></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"
              ></path></svg
            >
            {$t("reset_button")}
          </button>
        </div>
      </div>

      <div
        id="cv-train-card"
        class="mt-4 bg-white/70 backdrop-blur-md rounded-2xl border border-white/60 shadow-[0_8px_30px_rgba(0,0,0,0.02)] overflow-hidden hover:border-indigo-300/80 transition-all duration-300"
      >
        {#if trainingError}
          <div
            class="px-6 py-3 bg-red-50 border-b border-red-100 flex items-center gap-2 text-sm text-red-700 font-medium"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              ><path
                d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
              ></path><line x1="12" y1="9" x2="12" y2="13"></line><line
                x1="12"
                y1="17"
                x2="12.01"
                y2="17"
              ></line></svg
            >
            {trainingError}
          </div>
        {/if}
        {#if isTrainingModel}
          <div class="px-6 pt-4 pb-0">
            <div
              class="flex justify-between text-xs font-medium text-zinc-500 mb-1.5"
            >
              <span>{$t("processing_images")}</span>
              <span>{trainingProgress}%</span>
            </div>
            <div
              class="w-full bg-zinc-100 h-1.5 rounded-full overflow-hidden"
            >
              <div
                class="bg-indigo-500 h-full rounded-full transition-all duration-200"
                style="width:{trainingProgress}%"
              ></div>
            </div>
          </div>
        {/if}
        <div class="p-6 flex items-center justify-between gap-4">
          <div>
            <h3 class="text-base font-semibold mb-1">{$t("train_button")}</h3>
            <p class="text-sm text-zinc-500 leading-relaxed">
              {$t("teach_desc")}
            </p>
          </div>
          <button
            on:click={trainModel}
            disabled={isTrainingModel}
            class="shrink-0 px-6 py-2.5 font-medium rounded-lg shadow-sm transition-all text-sm flex items-center gap-2 justify-center disabled:opacity-50 {isModelTrained &&
            !isTrainingModel
              ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
              : 'bg-indigo-600 hover:bg-indigo-700 text-white'} {canTrain &&
            !isModelTrained &&
            !isTrainingModel
              ? 'ring-4 ring-indigo-500/50 animate-pulse'
              : ''}"
          >
            {#if isTrainingModel}
              {$t("evaluating")}
            {:else if isModelTrained}
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.5"
                ><polyline points="20 6 9 17 4 12"></polyline></svg
              >
              {$t("trained_button")}
            {:else}
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                ><polygon points="5 3 19 12 5 21 5 3"></polygon></svg
              >
              {$t("train_button")}
            {/if}
          </button>
        </div>
      </div>
    </section>

    <aside class="lg:col-span-4 flex flex-col gap-6">
      <h2 class="text-lg font-semibold tracking-tight">
        {$t("test_machine")}
      </h2>
      <div id="cv-preview-card" class="flex flex-col">
        <PreviewCard
        {net}
        classifier={customModel}
        {classes}
        {isModelTrained}
        preprocess={isDemoDatasetLoaded && activeDemoDatasetType === "mnist"
          ? preprocessMnistCanvas
          : null}
        strokeWidth={isDemoDatasetLoaded && activeDemoDatasetType === "mnist"
          ? 20
          : 12}
      >
        <div
          class="bg-zinc-100 aspect-square relative flex items-center justify-center overflow-hidden border-b border-zinc-200"
        >
          {#if showExplanation && explanationDataUrl}
            <!-- svelte-ignore a11y-missing-attribute -->
            <img
              src={explanationDataUrl}
              class="w-full h-full object-contain"
            />
            <!-- Legend -->
            <div
              class="absolute bottom-2 left-2 right-2 flex items-center gap-2 bg-black/60 rounded-md px-2 py-1.5 backdrop-blur-sm"
            >
              <div
                class="h-2 flex-1 rounded-full"
                style="background: linear-gradient(to right, rgba(0,200,30,0.85), rgba(255,165,0,0.85), rgba(255,30,30,0.9))"
              ></div>
              <span class="text-white text-[10px] font-medium shrink-0"
                >{$t("heatmap_low")} → {$t("heatmap_high")}</span
              >
            </div>
          {:else if previewUrl}
            <!-- svelte-ignore a11y-missing-attribute -->
            <img src={previewUrl} class="w-full h-full object-contain" />
          {:else}
            <div class="flex flex-col items-center gap-2 text-center px-4">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"
                class="text-zinc-300"
                ><rect x="3" y="3" width="18" height="18" rx="2" ry="2"
                ></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline
                  points="21 15 16 10 5 21"
                ></polyline></svg
              >
              <p class="text-xs text-zinc-400 font-medium">
                {$t("test_desc")}
              </p>
            </div>
          {/if}
          {#if isExplaining}
            <div
              class="absolute inset-0 bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center gap-3"
            >
              <div
                class="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"
              ></div>
              <p class="text-xs font-medium text-zinc-600">
                {$t("explaining")}
              </p>
            </div>
          {/if}
        </div>

        <div class="p-5 flex flex-col gap-4">
          {#if isDemoDatasetLoaded}
            {@const currentDemoDatasets =
              activeDemoDatasetType === "mnist"
                ? mnistDatasets
                : demoDatasets}
            <div
              class="border border-indigo-100 bg-indigo-50/40 rounded-lg p-3 flex flex-col gap-3"
            >
              <div class="flex flex-col gap-2.5">
                <span
                  class="text-xs font-semibold text-indigo-700 uppercase tracking-wide"
                  >{$t("demo_test")}</span
                >
                <div class="flex flex-wrap gap-1.5">
                  {#each currentDemoDatasets as dataset, demoIdx}
                    <button
                      on:click={() =>
                        selectDemoTestImage(demoIdx, dataset.tests[0].src)}
                      class="px-3 py-1.5 text-xs font-semibold rounded-md border transition-colors {selectedDemoTestClassId ===
                      demoIdx
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                        : 'bg-white text-indigo-600 border-indigo-200 hover:border-indigo-400 hover:bg-indigo-50'}"
                    >
                      {$t(dataset.labelKey).replace("Dígito ", "")}
                    </button>
                  {/each}
                </div>
              </div>
              <div class="grid grid-cols-5 gap-2">
                {#each currentDemoDatasets[selectedDemoTestClassId]?.tests ?? [] as demoImg, demoImgIdx}
                  <button
                    on:click={() =>
                      selectDemoTestImage(
                        selectedDemoTestClassId,
                        demoImg.src,
                      )}
                    class="aspect-square rounded-md overflow-hidden border-2 transition-colors bg-white {previewUrl ===
                    demoImg.src
                      ? 'border-indigo-500'
                      : 'border-white hover:border-indigo-300'}"
                    aria-label={`${$t("demo_image")} ${demoImgIdx + 1}: ${demoImg.title}`}
                  >
                    <img
                      src={demoImg.src}
                      alt={demoImg.title}
                      class="w-full h-full object-cover {activeDemoDatasetType ===
                      'mnist'
                        ? 'filter invert'
                        : ''}"
                    />
                  </button>
                {/each}
              </div>
              <details
                class="rounded-md border border-indigo-100 bg-white/70"
              >
                <summary
                  class="cursor-pointer select-none px-3 py-2 text-xs font-semibold text-indigo-700"
                >
                  {$t("demo_references")}
                </summary>
                <div
                  class="border-t border-indigo-100 px-3 py-3 max-h-56 overflow-y-auto flex flex-col gap-4"
                >
                  {#if activeDemoDatasetType === "mnist"}
                    <a
                      href="https://www.kaggle.com/datasets/alexanderyyy/mnist-png"
                      target="_blank"
                      rel="noreferrer"
                      class="group rounded-md border border-zinc-100 bg-white px-2.5 py-2 text-left hover:border-indigo-200 hover:bg-indigo-50/40 transition-colors break-all"
                    >
                      <span
                        class="block text-xs font-medium text-zinc-700 group-hover:text-indigo-700"
                        >MNIST Dataset (Kaggle)</span
                      >
                      <span class="block mt-0.5 text-[11px] text-zinc-500"
                        >https://www.kaggle.com/datasets/alexanderyyy/mnist-png</span
                      >
                    </a>
                  {:else}
                    <div>
                      <p
                        class="mb-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-400"
                      >
                        {$t("demo_training_refs")}
                      </p>
                      <div class="flex flex-col gap-2">
                        {#each currentDemoDatasets[selectedDemoTestClassId]?.training ?? [] as ref, refIdx}
                          <a
                            href={ref.source}
                            target="_blank"
                            rel="noreferrer"
                            class="group rounded-md border border-zinc-100 bg-white px-2.5 py-2 text-left hover:border-indigo-200 hover:bg-indigo-50/40 transition-colors"
                          >
                            <span
                              class="block text-xs font-medium text-zinc-700 group-hover:text-indigo-700"
                              >{refIdx + 1}. {ref.title}</span
                            >
                            <span
                              class="block mt-0.5 text-[11px] text-zinc-500"
                              >{ref.author} · {ref.license}</span
                            >
                          </a>
                        {/each}
                      </div>
                    </div>
                    <div>
                      <p
                        class="mb-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-400"
                      >
                        {$t("demo_test_refs")}
                      </p>
                      <div class="flex flex-col gap-2">
                        {#each currentDemoDatasets[selectedDemoTestClassId]?.tests ?? [] as ref, refIdx}
                          <a
                            href={ref.source}
                            target="_blank"
                            rel="noreferrer"
                            class="group rounded-md border border-zinc-100 bg-white px-2.5 py-2 text-left hover:border-indigo-200 hover:bg-indigo-50/40 transition-colors"
                          >
                            <span
                              class="block text-xs font-medium text-zinc-700 group-hover:text-indigo-700"
                              >{refIdx + 1}. {ref.title}</span
                            >
                            <span
                              class="block mt-0.5 text-[11px] text-zinc-500"
                              >{ref.author} · {ref.license}</span
                            >
                          </a>
                        {/each}
                      </div>
                    </div>
                  {/if}
                </div>
              </details>
            </div>
          {/if}

          <label
            class="w-full flex justify-between items-center px-4 py-2.5 text-sm border border-zinc-200 rounded-lg cursor-pointer hover:bg-zinc-50 hover:border-indigo-300 transition-all bg-zinc-50"
          >
            <span class="font-medium text-zinc-700">{$t("data_input")}</span>
            <span
              class="text-indigo-600 font-semibold text-xs uppercase tracking-wide"
              >{$t("browse")}</span
            >
            <input
              type="file"
              accept="image/*"
              on:change={(e) => {
                showExplanation = false;
                handlePreviewUpload(e);
              }}
              class="hidden"
            />
          </label>

          <!-- XAI Explain Button -->
          {#if isModelTrained && previewUrl}
            <div class="border-t border-zinc-100 pt-4 flex flex-col gap-2">
              <div class="flex items-center justify-between">
                <div>
                  <p class="text-xs font-semibold text-zinc-700">
                    {$t("explanation_title")}
                  </p>
                  <p class="text-xs text-zinc-400 mt-0.5">
                    {$t("explanation_desc")}
                  </p>
                </div>
              </div>
              <div class="flex gap-2">
                <button
                  on:click={explainPrediction}
                  disabled={isExplaining}
                  class="flex-1 py-2 text-xs font-semibold bg-zinc-900 hover:bg-zinc-700 text-white rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    ><circle cx="11" cy="11" r="8"></circle><line
                      x1="21"
                      y1="21"
                      x2="16.65"
                      y2="16.65"
                    ></line><line x1="11" y1="8" x2="11" y2="14"></line><line
                      x1="8"
                      y1="11"
                      x2="14"
                      y2="11"
                    ></line></svg
                  >
                  {$t("explain_btn")}
                </button>
                {#if showExplanation}
                  <button
                    on:click={() => (showExplanation = false)}
                    class="px-3 py-2 text-xs font-medium border border-zinc-200 rounded-lg hover:bg-zinc-50 transition-colors text-zinc-600"
                  >
                    {$t("show_original")}
                  </button>
                {/if}
              </div>
            </div>
          {/if}
        </div>
      </PreviewCard>
      </div>
    </aside>
  </main>

  <!-- Reset / save-dataset modals are deliberately rendered OUTSIDE <main>.
     Some ancestors of the CV layout use `backdrop-filter` (cards) and
     Tailwind's transform utilities (button hover scales) which create
     new containing blocks for `position: fixed` per CSS spec. When the
     modal sits inside that subtree, `inset-0` clips to the ancestor
     instead of the viewport — leaving the header and the sections below
     <main> un-blurred. Hoisting the modals to root sibling level is
     the standard portal-equivalent fix. -->
  {#if showResetConfirm}
    <div
      class="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm transition-opacity fade-in"
    >
      <div
        class="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col fade-up"
      >
        <div class="p-6">
          <div
            class="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center text-red-600 mb-4 mx-auto ring-8 ring-red-50/50"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              ><path d="M3 6h18"></path><path
                d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"
              ></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"
              ></path></svg
            >
          </div>
          <h3 class="text-lg font-bold text-zinc-900 text-center mb-2">
            {$t("reset_modal_title")}
          </h3>
          <p class="text-sm text-zinc-500 text-center leading-relaxed">
            {$t("reset_modal_desc_1")}
            <strong class="text-zinc-700 font-semibold"
              >{$t("reset_modal_desc_2")}</strong
            >.
          </p>
        </div>
        <div
          class="px-6 py-4 bg-zinc-50/80 border-t border-zinc-100 flex gap-3"
        >
          <button
            on:click={() => (showResetConfirm = false)}
            class="flex-1 px-4 py-2.5 text-sm font-semibold text-zinc-600 bg-white border border-zinc-200 hover:bg-zinc-50 hover:text-zinc-900 rounded-lg transition-colors"
          >
            {$t("reset_modal_cancel")}
          </button>
          <button
            on:click={executeReset}
            class="flex-1 px-4 py-2.5 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors shadow-sm"
          >
            {$t("reset_modal_confirm")}
          </button>
        </div>
      </div>
    </div>
  {/if}

  {#if showSaveDatasetModal}
    <div
      class="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm transition-opacity fade-in"
    >
      <div
        class="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col fade-up"
      >
        <div class="p-6">
          <div
            class="w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center text-amber-600 mb-4 mx-auto ring-8 ring-amber-50/50"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              ><path
                d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"
              /><polyline points="17 21 17 13 7 13 7 21" /><polyline
                points="7 3 7 8 15 8"
              /></svg
            >
          </div>
          <h3 class="text-lg font-bold text-zinc-900 text-center mb-2">
            {$t("save_dataset_title")}
          </h3>
          <p class="text-sm text-zinc-500 text-center leading-relaxed mb-4">
            {$t("save_dataset_desc")}
          </p>
          {#if saveDatasetError}
            <div
              class="mb-3 px-3 py-2 bg-red-50 border border-red-100 rounded-lg text-sm text-red-700 font-medium text-center"
            >
              {saveDatasetError}
            </div>
          {/if}
          <input
            type="text"
            bind:value={saveDatasetName}
            placeholder={$t("save_dataset_placeholder")}
            class="w-full px-4 py-2.5 text-sm border border-zinc-200 rounded-lg outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100 transition-all"
            on:keydown={(e) => {
              if (e.key === "Enter") confirmSaveDataset();
            }}
          />
        </div>
        <div
          class="px-6 py-4 bg-zinc-50/80 border-t border-zinc-100 flex gap-3"
        >
          <button
            on:click={() => (showSaveDatasetModal = false)}
            class="flex-1 px-4 py-2.5 text-sm font-semibold text-zinc-600 bg-white border border-zinc-200 hover:bg-zinc-50 hover:text-zinc-900 rounded-lg transition-colors"
          >
            {$t("reset_modal_cancel")}
          </button>
          <button
            on:click={confirmSaveDataset}
            disabled={!saveDatasetName.trim()}
            class="flex-1 px-4 py-2.5 text-sm font-semibold text-white bg-amber-600 hover:bg-amber-700 disabled:bg-amber-300 rounded-lg transition-colors shadow-sm"
          >
            {$t("save_dataset_confirm")}
          </button>
        </div>
      </div>
    </div>
  {/if}

  {#if activeWebcamClass !== null}
    <WebcamModal
      classId={activeWebcamClass}
      className={classes.find((c) => c.id === activeWebcamClass)?.name ||
        "Class"}
      on:capture={handleWebcamCapture}
      on:close={() => (activeWebcamClass = null)}
    />
  {/if}

  {#if activeDrawClass !== null}
    <DrawModal
      classId={activeDrawClass}
      className={classes.find((c) => c.id === activeDrawClass)?.name ||
        "Class"}
      preprocess={isDemoDatasetLoaded && activeDemoDatasetType === "mnist"
        ? preprocessMnistCanvas
        : null}
      strokeWidth={isDemoDatasetLoaded && activeDemoDatasetType === "mnist"
        ? 20
        : 12}
      on:capture={handleDrawCapture}
      on:close={() => (activeDrawClass = null)}
    />
  {/if}

  {#if activeTestWebcamClass !== null}
    <WebcamModal
      classId={activeTestWebcamClass}
      className={"Teste - " +
        (classes.find((c) => c.id === activeTestWebcamClass)?.name ||
          "Class")}
      on:capture={handleTestWebcamCapture}
      on:close={() => (activeTestWebcamClass = null)}
    />
  {/if}

  {#if activeTestDrawClass !== null}
    <DrawModal
      classId={activeTestDrawClass}
      className={"Teste - " +
        (classes.find((c) => c.id === activeTestDrawClass)?.name ||
          "Class")}
      preprocess={isDemoDatasetLoaded && activeDemoDatasetType === "mnist"
        ? preprocessMnistCanvas
        : null}
      strokeWidth={isDemoDatasetLoaded && activeDemoDatasetType === "mnist"
        ? 20
        : 12}
      on:capture={handleTestDrawCapture}
      on:close={() => (activeTestDrawClass = null)}
    />
  {/if}

  <section class="max-w-[85rem] mx-auto w-full px-8 mt-12 relative z-10">
    <div
      class="bg-white/70 backdrop-blur-md rounded-2xl border border-white/60 shadow-[0_8px_30px_rgba(0,0,0,0.02)] overflow-hidden hover:border-indigo-300/80 transition-all duration-300"
    >
      <div class="bg-zinc-900 px-6 py-5">
        <h2 class="text-base font-semibold tracking-tight text-white">
          {$t("diagnostics")}
        </h2>
        <p class="text-xs text-zinc-400 mt-0.5">{$t("diag_desc")}</p>
      </div>

      <div class="p-6 grid grid-cols-1 xl:grid-cols-12 gap-8">
        <div class="xl:col-span-4 flex flex-col gap-4">
          <div>
            <h3 class="text-sm font-semibold text-zinc-700">
              {$t("test_env")}
            </h3>
            <p class="text-xs text-zinc-500 leading-relaxed mt-1">
              {$t("test_env_desc")}
            </p>
          </div>

          <div class="flex flex-col gap-3">
            {#each classes as item}
              <div
                class="bg-zinc-50 rounded-lg border border-zinc-200 overflow-hidden"
              >
                <!-- Header row -->
                <div
                  class="px-3 py-2.5 flex justify-between items-center border-b border-zinc-200 bg-white"
                >
                  <div>
                    <div class="text-sm font-semibold text-zinc-800">
                      {item.name}
                    </div>
                    <div class="text-xs text-zinc-400">
                      {(testSamples[item.id] || []).length}
                      {$t("samples")}
                    </div>
                  </div>
                  <div class="flex gap-2">
                    <button
                      on:click={() => (activeTestWebcamClass = item.id)}
                      class="flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 bg-zinc-100 border border-zinc-200 text-zinc-700 rounded cursor-pointer hover:border-indigo-300 hover:text-indigo-600 transition-colors"
                      title="Webcam"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        ><path
                          d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"
                        ></path><circle cx="12" cy="13" r="4"></circle></svg
                      >
                    </button>
                    <button
                      on:click={() => (activeTestDrawClass = item.id)}
                      class="flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 bg-zinc-100 border border-zinc-200 text-zinc-700 rounded cursor-pointer hover:border-indigo-300 hover:text-indigo-600 transition-colors"
                      title={$t("canvas")}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        ><path d="M12 20h9" /><path
                          d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"
                        /></svg
                      >
                    </button>
                    <label
                      class="flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 bg-zinc-100 border border-zinc-200 rounded cursor-pointer hover:border-indigo-300 hover:text-indigo-600 transition-colors"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        ><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"
                        ></path><polyline points="17 8 12 3 7 8"
                        ></polyline><line x1="12" y1="3" x2="12" y2="15"
                        ></line></svg
                      >
                      {$t("upload_photos")}
                      <input
                        type="file"
                        multiple
                        accept="image/*"
                        on:change={(e) => handleTestUpload(e, item.id)}
                        class="hidden"
                      />
                    </label>
                  </div>
                </div>
                <!-- Thumbnail gallery -->
                {#if testSamples[item.id] && testSamples[item.id].length > 0}
                  <div
                    class="p-2 flex flex-wrap gap-1.5 max-h-32 overflow-y-auto"
                  >
                    {#each testSamples[item.id] as imgUrl, idx}
                      <div
                        class="relative group/timg w-10 h-10 rounded overflow-hidden border border-zinc-200 shrink-0"
                      >
                        <img
                          src={imgUrl}
                          class="w-full h-full object-cover"
                          alt="test sample"
                        />
                        <button
                          on:click={() => removeTestImage(item.id, idx)}
                          class="absolute inset-0 bg-red-500/80 text-white opacity-0 group-hover/timg:opacity-100 flex items-center justify-center transition-opacity"
                          aria-label="Remove test sample"
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="10"
                            height="10"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="3"
                            ><line x1="18" y1="6" x2="6" y2="18"></line><line
                              x1="6"
                              y1="6"
                              x2="18"
                              y2="18"
                            ></line></svg
                          >
                        </button>
                      </div>
                    {/each}
                  </div>
                {:else}
                  <div class="px-3 py-2 text-xs text-zinc-400 italic">
                    {$t("no_images")}
                  </div>
                {/if}
              </div>
            {/each}
          </div>

          <button
            on:click={evaluateModel}
            disabled={!isModelTrained ||
              totalTestSamples === 0 ||
              isEvaluating}
            class="w-full py-2.5 text-sm font-medium bg-zinc-800 hover:bg-zinc-900 text-white rounded-lg transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {#if isEvaluating}
              <div
                class="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin"
              ></div>
            {/if}
            {isEvaluating ? $t("evaluating") : $t("run_diag")}
          </button>
        </div>

        <div class="xl:col-span-8 flex flex-col gap-4">
          <h3 class="text-sm font-semibold text-zinc-700">
            {$t("perf_dist")}
          </h3>

          {#if confusionMatrix.length > 0}
            <div class="overflow-hidden border border-zinc-200 rounded-lg">
              <table class="w-full text-sm text-left">
                <thead
                  class="bg-zinc-50 text-xs uppercase font-semibold text-zinc-500 border-b border-zinc-200"
                >
                  <tr>
                    <th class="px-4 py-3 border-r border-zinc-200"
                      >True Label \ Pred</th
                    >
                    {#each classes as c}
                      <th
                        class="px-4 py-3 border-r border-zinc-200 text-center"
                        >{c.name}</th
                      >
                    {/each}
                  </tr>
                </thead>
                <tbody class="divide-y divide-zinc-200 bg-white">
                  {#each classes as realClass, rIndex}
                    <tr>
                      <td
                        class="px-4 py-3 font-medium text-zinc-700 border-r border-zinc-200 bg-zinc-50/30"
                        >{realClass.name}</td
                      >
                      {#each classes as predClass, cIndex}
                        {@const count = confusionMatrix[rIndex][cIndex]}
                        {@const isActive =
                          inspectorCell?.rIdx === rIndex &&
                          inspectorCell?.cIdx === cIndex}
                        <td
                          class="px-4 py-3 text-center border-r border-zinc-200 font-medium transition-all
                                               {count > 0
                            ? 'cursor-pointer'
                            : ''}
                                               {isActive
                            ? 'ring-2 ring-inset ring-indigo-400'
                            : ''}
                                               {rIndex === cIndex && count > 0
                            ? 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
                            : ''}
                                               {rIndex !== cIndex && count > 0
                            ? 'bg-red-50 text-red-600 hover:bg-red-100'
                            : ''}
                                               {count === 0
                            ? 'text-zinc-300 font-normal'
                            : ''}"
                          on:click={() => {
                            if (count > 0) {
                              inspectorCell = { rIdx: rIndex, cIdx: cIndex };
                              inspectorExplainUrl = "";
                            }
                          }}
                        >
                          {count}
                        </td>
                      {/each}
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
            <p
              class="text-xs text-zinc-500 leading-relaxed max-w-2xl bg-zinc-50 p-3 rounded border border-zinc-100"
            >
              {$t("matrix_note")}
              <span class="font-medium text-indigo-600"
                >{$t("click_cell_hint")}</span
              >
            </p>

            <!-- Per-class Metrics Table -->
            {#if classMetrics.length > 0}
              <div class="overflow-hidden border border-zinc-200 rounded-lg">
                <div
                  class="px-4 py-3 bg-zinc-50 border-b border-zinc-200 flex items-center justify-between"
                >
                  <h4 class="text-sm font-semibold text-zinc-700">
                    {$t("metrics_title")}
                  </h4>
                  <div class="flex items-center gap-2">
                    <span class="text-xs font-medium text-zinc-500"
                      >{$t("metrics_accuracy")}:</span
                    >
                    <span
                      class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold {globalAccuracy >=
                      0.8
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : globalAccuracy >= 0.5
                          ? 'bg-amber-50 text-amber-700 border border-amber-200'
                          : 'bg-red-50 text-red-600 border border-red-200'}"
                    >
                      {(globalAccuracy * 100).toFixed(1)}%
                    </span>
                  </div>
                </div>
                <table class="w-full text-sm">
                  <thead
                    class="bg-zinc-50/50 text-xs uppercase font-semibold text-zinc-500 border-b border-zinc-200"
                  >
                    <tr>
                      <th
                        class="px-4 py-2.5 text-left border-r border-zinc-200"
                        >{$t("metrics_class")}</th
                      >
                      <th
                        class="px-4 py-2.5 text-center border-r border-zinc-200"
                        >Precision</th
                      >
                      <th
                        class="px-4 py-2.5 text-center border-r border-zinc-200"
                        >Recall</th
                      >
                      <th
                        class="px-4 py-2.5 text-center border-r border-zinc-200"
                        >F1-Score</th
                      >
                      <th class="px-4 py-2.5 text-center">Support</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-zinc-100 bg-white">
                    {#each classes as cls, i}
                      {@const m = classMetrics[i]}
                      <tr class="hover:bg-zinc-50/50 transition-colors">
                        <td
                          class="px-4 py-3 font-medium text-zinc-700 border-r border-zinc-200"
                          >{cls.name}</td
                        >
                        <td class="px-4 py-2.5 border-r border-zinc-200">
                          <div class="flex items-center gap-2 justify-center">
                            <div
                              class="w-16 h-1.5 bg-zinc-100 rounded-full overflow-hidden"
                            >
                              <div
                                class="h-full rounded-full transition-all {m.precision >=
                                0.8
                                  ? 'bg-emerald-500'
                                  : m.precision >= 0.5
                                    ? 'bg-amber-400'
                                    : 'bg-red-400'}"
                                style="width: {m.precision * 100}%"
                              ></div>
                            </div>
                            <span
                              class="text-xs font-semibold tabular-nums w-12 text-right {m.precision >=
                              0.8
                                ? 'text-emerald-700'
                                : m.precision >= 0.5
                                  ? 'text-amber-600'
                                  : 'text-red-500'}"
                              >{(m.precision * 100).toFixed(1)}%</span
                            >
                          </div>
                        </td>
                        <td class="px-4 py-2.5 border-r border-zinc-200">
                          <div class="flex items-center gap-2 justify-center">
                            <div
                              class="w-16 h-1.5 bg-zinc-100 rounded-full overflow-hidden"
                            >
                              <div
                                class="h-full rounded-full transition-all {m.recall >=
                                0.8
                                  ? 'bg-emerald-500'
                                  : m.recall >= 0.5
                                    ? 'bg-amber-400'
                                    : 'bg-red-400'}"
                                style="width: {m.recall * 100}%"
                              ></div>
                            </div>
                            <span
                              class="text-xs font-semibold tabular-nums w-12 text-right {m.recall >=
                              0.8
                                ? 'text-emerald-700'
                                : m.recall >= 0.5
                                  ? 'text-amber-600'
                                  : 'text-red-500'}"
                              >{(m.recall * 100).toFixed(1)}%</span
                            >
                          </div>
                        </td>
                        <td class="px-4 py-2.5 border-r border-zinc-200">
                          <div class="flex items-center gap-2 justify-center">
                            <div
                              class="w-16 h-1.5 bg-zinc-100 rounded-full overflow-hidden"
                            >
                              <div
                                class="h-full rounded-full transition-all {m.f1 >=
                                0.8
                                  ? 'bg-emerald-500'
                                  : m.f1 >= 0.5
                                    ? 'bg-amber-400'
                                    : 'bg-red-400'}"
                                style="width: {m.f1 * 100}%"
                              ></div>
                            </div>
                            <span
                              class="text-xs font-semibold tabular-nums w-12 text-right {m.f1 >=
                              0.8
                                ? 'text-emerald-700'
                                : m.f1 >= 0.5
                                  ? 'text-amber-600'
                                  : 'text-red-500'}"
                              >{(m.f1 * 100).toFixed(1)}%</span
                            >
                          </div>
                        </td>
                        <td
                          class="px-4 py-2.5 text-center text-xs font-medium text-zinc-500 tabular-nums"
                          >{m.support}</td
                        >
                      </tr>
                    {/each}
                  </tbody>
                </table>
              </div>
            {/if}

            <!-- Sample Inspector -->
            {#if inspectorCell !== null && detailedResults.length > 0}
              {@const cell =
                detailedResults[inspectorCell.rIdx]?.[inspectorCell.cIdx] ??
                []}
              {@const isCorrect = inspectorCell.rIdx === inspectorCell.cIdx}
              <div class="border border-zinc-200 rounded-lg overflow-hidden">
                <div
                  class="px-4 py-3 {isCorrect
                    ? 'bg-indigo-50 border-b border-indigo-100'
                    : 'bg-red-50 border-b border-red-100'} flex items-center justify-between"
                >
                  <div>
                    <p
                      class="text-sm font-semibold {isCorrect
                        ? 'text-indigo-800'
                        : 'text-red-800'}"
                    >
                      {classes[inspectorCell.rIdx]?.name} → {classes[
                        inspectorCell.cIdx
                      ]?.name}
                      <span class="ml-2 text-xs font-normal opacity-70"
                        >{isCorrect
                          ? $t("sample_correct")
                          : $t("sample_wrong")}</span
                      >
                    </p>
                    <p class="text-xs opacity-60 mt-0.5">
                      {cell.length}
                      {$t("inspector_hint")}
                    </p>
                  </div>
                  <button
                    on:click={() => {
                      inspectorCell = null;
                      inspectorExplainUrl = "";
                    }}
                    class="text-zinc-400 hover:text-zinc-600 transition-colors"
                    aria-label="Close sample inspector"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      ><line x1="18" y1="6" x2="6" y2="18"></line><line
                        x1="6"
                        y1="6"
                        x2="18"
                        y2="18"
                      ></line></svg
                    >
                  </button>
                </div>

                <div class="p-4 flex gap-4 flex-wrap bg-white">
                  {#each cell as sample, sIdx}
                    <div class="flex flex-col items-center gap-1.5">
                      <button
                        type="button"
                        class="relative group/s w-20 h-20 rounded-lg overflow-hidden border-2 {inspectorExplainingIdx ===
                        sIdx
                          ? 'border-indigo-400'
                          : 'border-zinc-200 hover:border-indigo-300'} cursor-pointer transition-colors"
                        on:click={() =>
                          explainInspectorImage(sample.imgUrl, sIdx)}
                        aria-label="Explain sample prediction"
                      >
                        {#if inspectorExplainUrl && inspectorCell && inspectorExplainingIdx === null && sIdx === inspectorLastExplainedIdx}
                          <img
                            src={inspectorExplainUrl}
                            class="w-full h-full object-cover"
                            alt="heatmap"
                          />
                        {:else}
                          <img
                            src={sample.imgUrl}
                            class="w-full h-full object-cover"
                            alt="sample"
                          />
                        {/if}
                        {#if inspectorExplainingIdx === sIdx}
                          <div
                            class="absolute inset-0 bg-white/80 flex items-center justify-center"
                          >
                            <div
                              class="w-5 h-5 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin"
                            ></div>
                          </div>
                        {:else}
                          <div
                            class="absolute inset-0 bg-black/40 opacity-0 group-hover/s:opacity-100 flex items-center justify-center transition-opacity"
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              width="16"
                              height="16"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="white"
                              stroke-width="2"
                              ><circle cx="11" cy="11" r="8"></circle><line
                                x1="21"
                                y1="21"
                                x2="16.65"
                                y2="16.65"
                              ></line></svg
                            >
                          </div>
                        {/if}
                      </button>
                      <span
                        class="text-xs font-semibold {isCorrect
                          ? 'text-indigo-600'
                          : 'text-red-500'}">{sample.confidence}%</span
                      >
                    </div>
                  {/each}
                </div>

                {#if inspectorExplainUrl}
                  <div class="px-4 pb-4 bg-white border-t border-zinc-100">
                    <div
                      class="relative rounded-lg overflow-hidden w-48 h-48"
                    >
                      <img
                        src={inspectorExplainUrl}
                        class="w-full h-full object-contain bg-zinc-100"
                        alt="heatmap"
                      />
                      <div
                        class="absolute bottom-1 left-1 right-1 flex items-center gap-1.5 bg-black/60 rounded px-1.5 py-1 backdrop-blur-sm"
                      >
                        <div
                          class="h-1.5 flex-1 rounded-full"
                          style="background: linear-gradient(to right, rgba(0,200,30,0.85), rgba(255,165,0,0.85), rgba(255,30,30,0.9))"
                        ></div>
                        <span
                          class="text-white text-[9px] font-medium shrink-0"
                          >← {$t("heatmap_low")} · {$t("heatmap_high")} →</span
                        >
                      </div>
                    </div>
                    <button
                      on:click={() => (inspectorExplainUrl = "")}
                      class="mt-2 text-xs text-zinc-400 hover:text-zinc-600 underline"
                      >{$t("hide_map")}</button
                    >
                  </div>
                {/if}
              </div>
            {/if}
          {:else}
            <div
              class="h-44 bg-zinc-50/50 rounded-lg border border-dashed border-zinc-300 flex items-center justify-center text-sm font-medium text-zinc-400"
            >
              {$t("awaiting_samples")}
            </div>
          {/if}
        </div>
      </div>
    </div>
  </section>

  <!-- ── Decision Tree Section ───────────────────────────── -->
  <section class="max-w-[85rem] mx-auto w-full px-8 mt-12 relative z-10">
    <div
      class="bg-white/70 backdrop-blur-md rounded-2xl border border-white/60 shadow-[0_8px_30px_rgba(0,0,0,0.02)] overflow-hidden hover:border-indigo-300/80 transition-all duration-300"
    >
      <div class="bg-zinc-900 px-6 py-5">
        <h2 class="text-base font-semibold tracking-tight text-white">
          {$t("dtree_title")}
        </h2>
        <p class="text-xs text-zinc-400 mt-0.5">{$t("dtree_subtitle")}</p>
      </div>

      <div class="p-6 grid grid-cols-1 xl:grid-cols-12 gap-8">
        <!-- Left: Description + Run button -->
        <div class="xl:col-span-4 flex flex-col gap-4">
          <div>
            <h3 class="text-sm font-semibold text-zinc-700">
              {$t("dtree_title")}
            </h3>
            <p class="text-xs text-zinc-500 leading-relaxed mt-1">
              {$t("dtree_note")}
            </p>
          </div>

          <button
            on:click={buildTreeDiagnostic}
            disabled={!isModelTrained ||
              savedEmbeddings.length === 0 ||
              isBuildingTree}
            class="w-full py-2.5 text-sm font-medium bg-zinc-800 hover:bg-zinc-900 text-white rounded-lg transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {#if isBuildingTree}
              <div
                class="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin"
              ></div>
            {/if}
            {isBuildingTree ? $t("evaluating") : $t("run_diag")}
          </button>
        </div>

        <!-- Right: Tree visualization -->
        <div class="xl:col-span-8 flex flex-col gap-4">
          {#if decisionTree}
            <DecisionTreeViz
              tree={decisionTree}
              classNames={_treeClassNames}
            />
          {:else}
            <div
              class="h-44 bg-zinc-50/50 rounded-lg border border-dashed border-zinc-300 flex items-center justify-center text-sm font-medium text-zinc-400"
            >
              {$t("dtree_awaiting")}
            </div>
          {/if}
        </div>
      </div>
    </div>
  </section>
{/if}
