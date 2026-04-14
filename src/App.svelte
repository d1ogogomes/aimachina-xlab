<script lang="ts">
  import { onMount } from "svelte";
  import * as tf from "@tensorflow/tfjs";
  import * as mobilenet from "@tensorflow-models/mobilenet";
  import * as knnClassifier from "@tensorflow-models/knn-classifier";

  let isReady = false;
  let classifier: knnClassifier.KNNClassifier;
  let net: mobilenet.MobileNet;

  export let classes = [
    { id: 0, name: "Classe 1", count: 0, confidence: 0 },
    { id: 1, name: "Classe 2", count: 0, confidence: 0 },
  ];

  let isModelTrained = false;
  let previewUrl = "";
  let previewImageElement: HTMLImageElement;

  onMount(async () => {
    try {
      net = await mobilenet.load();
      classifier = knnClassifier.create();
      isReady = true;
    } catch (e) {
      console.error(e);
    }
  });

  // Upload em massa de fotos para treinar uma Classe
  async function handleClassUpload(event: Event, classId: number) {
    if (!isReady) return;
    const target = event.target as HTMLInputElement;
    const files = target.files;
    if (!files || files.length === 0) return;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const imgUrl = URL.createObjectURL(file);
      const img = new Image();
      img.src = imgUrl;

      await new Promise((resolve) => (img.onload = resolve));

      const activation = net.infer(img, true);
      classifier.addExample(activation, classId);

      classes = classes.map((c) =>
        c.id === classId ? { ...c, count: c.count + 1 } : c,
      );
    }
  }

  const trainModel = () => {
    const total = classes.reduce((sum, c) => sum + c.count, 0);
    if (total < 3) {
      alert(
        "Faz upload de pelo menos 3 imagens totais (ex: 2 na Classe 1, e 1 na Classe 2) para o modelo aprender alguma coisa!",
      );
      return;
    }
    isModelTrained = true;
    if (previewUrl) {
      runPrediction();
    }
  };

  // Upload de UMA foto para a zona de Preview (Teste)
  async function handlePreviewUpload(event: Event) {
    const target = event.target as HTMLInputElement;
    if (target.files && target.files.length > 0) {
      const file = target.files[0];
      previewUrl = URL.createObjectURL(file);

      // Aguarda 100ms para a tag <img> atualizar o src no DOM
      setTimeout(() => {
        if (isModelTrained) {
          runPrediction();
        }
      }, 100);
    }
  }

  async function runPrediction() {
    if (!isReady || !previewImageElement || !isModelTrained) return;

    const numExamples = classes.reduce((sum, c) => sum + c.count, 0);
    let k = numExamples >= 5 ? 5 : 3;

    const activation = net.infer(previewImageElement, "conv_preds");
    const result = await classifier.predictClass(activation, k);

    classes = classes.map((c) => {
      const conf = result.confidences[c.id] || 0;
      return { ...c, confidence: Math.round(conf * 100) };
    });
  }

  function addClass() {
    const newId = classes.length;
    classes = [
      ...classes,
      { id: newId, name: `Classe ${newId + 1}`, count: 0, confidence: 0 },
    ];
  }
</script>

<div
  class="min-h-screen bg-slate-50 flex flex-col p-8 font-sans text-slate-800"
>
  <div class="text-2xl font-black mb-8 text-slate-800">AIMachina XLab</div>

  <div class="flex flex-col lg:flex-row gap-6 items-start justify-center">
    <!-- COLUNA 1: CLASSES (ESQUERDA) -->
    <div class="w-full lg:w-1/3 flex flex-col gap-4">
      {#each classes as item}
        <div
          class="bg-white rounded-xl shadow-sm p-4 border border-violet-100 relative"
        >
          <div
            class="flex justify-between items-center mb-4 border-b border-slate-100 pb-2"
          >
            <input
              type="text"
              bind:value={item.name}
              class="font-bold text-lg text-slate-700 outline-none hover:bg-slate-50 p-1 rounded w-full"
            />
            <button class="text-slate-400 hover:text-slate-600">⋮</button>
          </div>

          <div class="text-sm font-bold text-slate-500 mb-3">
            {item.count} Image Samples
          </div>

          <div class="flex gap-2">
            <label
              class="w-full bg-indigo-50 text-indigo-600 font-bold py-3 rounded-lg flex flex-col items-center justify-center gap-1 hover:bg-indigo-100 active:bg-indigo-200 border border-indigo-100 transition-colors cursor-pointer"
            >
              <span class="text-xs">Upload Images</span>
              <!-- Permite múltiplas fotos na mesma categoria! -->
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
      {/each}

      <button
        on:click={addClass}
        class="w-full bg-slate-200/50 text-slate-500 font-bold py-4 rounded-xl hover:bg-slate-200 border-2 border-slate-300 border-dashed transition-colors"
      >
        + Add a class
      </button>
    </div>

    <!-- COLUNA 2: TRAINING (MEIO) -->
    <div
      class="w-full lg:w-1/6 flex items-center justify-center h-full pt-12 relative z-10"
    >
      <div
        class="bg-white rounded-xl shadow-sm p-4 border border-slate-200 w-full text-center relative"
      >
        <div class="font-bold text-slate-700 mb-4">Training</div>
        {#if !isModelTrained}
          <button
            on:click={trainModel}
            class="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-2 rounded-lg shadow-md transition-colors text-sm"
          >
            Train Model
          </button>
        {:else}
          <button
            disabled
            class="w-full bg-emerald-50 border border-emerald-200 text-emerald-700 font-bold py-3 px-2 rounded-lg text-sm"
          >
            Model Trained
          </button>
        {/if}
      </div>
    </div>

    <!-- COLUNA 3: PREVIEW (DIREITA) -->
    <div class="w-full lg:w-1/3">
      <div
        class="bg-white rounded-xl shadow-sm border border-slate-200 sticky top-4 overflow-hidden"
      >
        <div
          class="p-4 border-b border-slate-100 flex justify-between items-center"
        >
          <div class="font-bold text-slate-700">Preview Test</div>
          <label
            class="text-xs font-bold bg-slate-100 hover:bg-slate-200 py-1 px-3 rounded-full cursor-pointer transition"
          >
            Upload File
            <input
              type="file"
              accept="image/*"
              on:change={handlePreviewUpload}
              class="hidden"
            />
          </label>
        </div>

        <div
          class="bg-slate-100 relative aspect-video flex items-center justify-center mx-4 mt-4 rounded-lg overflow-hidden border border-slate-200 shadow-inner"
        >
          {#if previewUrl}
            <!-- svelte-ignore a11y-missing-attribute -->
            <img
              bind:this={previewImageElement}
              src={previewUrl}
              class="w-full h-full object-contain bg-white block"
            />
          {:else}
            <div class="text-slate-400 text-sm font-bold">
              No image for testing.<br />Click 'Upload File' above.
            </div>
          {/if}
        </div>

        <div class="p-4">
          <div class="font-bold text-slate-600 mb-4">Output</div>

          <div class="flex flex-col gap-4">
            {#each classes as item}
              <div>
                <div class="flex justify-between text-sm mb-1">
                  <span class="font-bold text-slate-600">{item.name}</span>
                  <span class="font-bold text-slate-800"
                    >{item.confidence}%</span
                  >
                </div>
                <div
                  class="w-full bg-slate-100 rounded-lg h-6 overflow-hidden border border-slate-200"
                >
                  <div
                    class="bg-orange-500 h-6 transition-all duration-300"
                    style="width: {item.confidence}%"
                  ></div>
                </div>
              </div>
            {/each}
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
