<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import * as tf from "@tensorflow/tfjs";
  import type * as mobilenet from "@tensorflow-models/mobilenet";
  import { t } from '../i18n';

  export let net: mobilenet.MobileNet | undefined;
  export let classifier: import('@tensorflow/tfjs').Sequential | null = null;
  export let classes: { id: number; name: string; confidence?: number }[] = [];
  export let isModelTrained: boolean = false;

  type OutputRow = { classId: number; label: string; confidence: number };
  const FEATURE_SIZE = 1024;

  let previewMode: 'webcam' | 'file' | 'canvas' = 'file';

  let video: HTMLVideoElement;
  let stream: MediaStream | null = null;
  let isActive = false;
  let requestRef: number;
  
  let predictions: OutputRow[] = [];
  $: outputRows = previewMode === 'webcam' || previewMode === 'canvas'
    ? predictions
    : classes.map(c => ({ classId: c.id, label: c.name, confidence: c.confidence || 0 }));

  $: if (classes) {
     if (predictions.length === 0 || predictions.length !== classes.length) {
         predictions = classes.map(c => ({ classId: c.id, label: c.name, confidence: 0 }));
     } else {
         predictions = predictions.map(p => {
             const c = classes.find(cl => cl.id === p.classId);
             return { ...p, label: c ? c.name : p.label };
         });
     }
  }

  let wasTrained = false;
  $: if (isModelTrained !== wasTrained) {
      if (isModelTrained && video && previewMode === 'webcam') {
          startCamera();
      } else if (!isModelTrained || previewMode === 'file') {
          stopCamera();
      }
      wasTrained = isModelTrained;
  }

  // Handle mode switch
  $: if (previewMode === 'file') {
      stopCamera();
      isPredictingCanvas = false;
  } else if (previewMode === 'canvas') {
      stopCamera();
      if (isModelTrained && !isPredictingCanvas) {
          isPredictingCanvas = true;
          predictLoop();
      }
  } else if (previewMode === 'webcam') {
      isPredictingCanvas = false;
      if (isModelTrained && !isActive) {
          // Small timeout to allow video element to render
          setTimeout(startCamera, 50);
      }
  }

  async function startCamera() {
    if (isActive) return;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      if (video) {
        video.srcObject = stream;
        video.play();
        isActive = true;
        predictLoop();
      }
    } catch (err) {
      console.error("Error accessing webcam: ", err);
    }
  }

  let isPredictingCanvas = false;

  function stopCamera() {
    isActive = false;
    if (requestRef) cancelAnimationFrame(requestRef);
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      stream = null;
    }
    if (previewMode !== 'canvas') {
      predictions = predictions.map(p => ({ ...p, confidence: 0 }));
    }
  }

  function normaliseEmbedding(activation: tf.Tensor): tf.Tensor2D {
    const embedding = activation.reshape([1, activation.size]) as tf.Tensor2D;

    if (embedding.shape[1] !== FEATURE_SIZE) {
      embedding.dispose();
      throw new Error(`Unexpected MobileNet embedding size: ${embedding.shape[1]}`);
    }

    return embedding;
  }

  async function predictLoop() {
    if (!net || !classifier || !isModelTrained) return;

    if (previewMode === 'webcam' && isActive && video && video.readyState === 4) {
      let img: tf.Tensor3D | undefined;
      let resized: tf.Tensor3D | undefined;
      let activation: tf.Tensor | undefined;
      let embedding: tf.Tensor2D | undefined;
      try {
        img = tf.browser.fromPixels(video);
        resized = tf.image.resizeBilinear(img, [224, 224]);
        activation = net.infer(resized, true) as tf.Tensor;
        embedding = normaliseEmbedding(activation);
        
        const predictionsTensor = classifier.predict(embedding) as import('@tensorflow/tfjs').Tensor;
        const confidences = await predictionsTensor.data();
        predictionsTensor.dispose();
        
        const classIndexMap = Object.fromEntries(classes.map((c, i) => [c.id, i]));
        predictions = classes.map(c => {
          const conf = confidences[classIndexMap[c.id]] || 0;
          return {
            classId: c.id,
            label: c.name,
            confidence: Math.round(conf * 100)
          };
        });
      } catch (e) {
        console.error("Live prediction error:", e);
      } finally {
        img?.dispose();
        resized?.dispose();
        embedding?.dispose();
        activation?.dispose();
      }
    } else if (previewMode === 'canvas' && isPredictingCanvas && drawCanvas) {
      let img: tf.Tensor3D | undefined;
      let resized: tf.Tensor3D | undefined;
      let activation: tf.Tensor | undefined;
      let embedding: tf.Tensor2D | undefined;
      try {
        img = tf.browser.fromPixels(drawCanvas);
        resized = tf.image.resizeBilinear(img, [224, 224]);
        activation = net.infer(resized, true) as tf.Tensor;
        embedding = normaliseEmbedding(activation);
        
        const predictionsTensor = classifier.predict(embedding) as import('@tensorflow/tfjs').Tensor;
        const confidences = await predictionsTensor.data();
        predictionsTensor.dispose();
        
        const classIndexMap = Object.fromEntries(classes.map((c, i) => [c.id, i]));
        predictions = classes.map(c => {
          const conf = confidences[classIndexMap[c.id]] || 0;
          return {
            classId: c.id,
            label: c.name,
            confidence: Math.round(conf * 100)
          };
        });
      } catch (e) {
        console.error("Live prediction error:", e);
      } finally {
        img?.dispose();
        resized?.dispose();
        embedding?.dispose();
        activation?.dispose();
      }
    }
    
    if ((isActive && previewMode === 'webcam') || (isPredictingCanvas && previewMode === 'canvas')) {
      requestRef = requestAnimationFrame(predictLoop);
    }
  }

  onMount(() => {
    if (isModelTrained) {
      if (previewMode === 'webcam') startCamera();
      if (previewMode === 'canvas') {
        isPredictingCanvas = true;
        predictLoop();
      }
    }
  });

  onDestroy(() => {
    stopCamera();
    isPredictingCanvas = false;
  });

  // Canvas drawing logic
  let drawCanvas: HTMLCanvasElement;
  let ctx: CanvasRenderingContext2D | null = null;
  let isDrawing = false;

  $: if (drawCanvas && previewMode === 'canvas' && !ctx) {
      ctx = drawCanvas.getContext('2d', { willReadFrequently: true });
      clearCanvas();
  }

  function startDrawing(e: MouseEvent | TouchEvent) {
      isDrawing = true;
      draw(e);
  }

  function stopDrawing() {
      isDrawing = false;
      if (ctx) ctx.beginPath();
  }

  function draw(e: MouseEvent | TouchEvent) {
      if (!isDrawing || !ctx || !drawCanvas) return;
      e.preventDefault(); // Prevent scrolling on touch
      
      const rect = drawCanvas.getBoundingClientRect();
      let clientX, clientY;
      
      if (e instanceof MouseEvent) {
          clientX = e.clientX;
          clientY = e.clientY;
      } else if (e.touches && e.touches.length > 0) {
          clientX = e.touches[0].clientX;
          clientY = e.touches[0].clientY;
      } else {
          return;
      }
      
      // Calculate coordinates respecting the internal canvas resolution
      const scaleX = drawCanvas.width / rect.width;
      const scaleY = drawCanvas.height / rect.height;
      const x = (clientX - rect.left) * scaleX;
      const y = (clientY - rect.top) * scaleY;
      
      ctx.lineWidth = 12; // Thicker line, but not too thick
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#ffffff'; // Draw in white on black background
      
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x, y);
  }

  function clearCanvas() {
      if (ctx && drawCanvas) {
          ctx.fillStyle = '#000000';
          ctx.fillRect(0, 0, drawCanvas.width, drawCanvas.height);
      }
  }

</script>

<div class="bg-white rounded-xl shadow-sm border border-zinc-200 overflow-hidden flex flex-col">
  <!-- Input Selector -->
  <div class="px-5 py-3 flex items-center justify-between bg-white border-b border-zinc-100">
    <span class="text-sm font-medium text-zinc-500">{$t("input_source")}</span>
    <select bind:value={previewMode} class="ml-auto text-sm border border-zinc-200 bg-white hover:bg-zinc-50 rounded-lg px-3 py-1.5 outline-none font-medium text-zinc-700 transition-colors cursor-pointer shadow-sm">
      <option value="webcam">{$t("webcam")}</option>
      <option value="canvas">{$t("canvas") || "Desenhar"}</option>
      <option value="file">{$t("file")}</option>
    </select>
  </div>

  <!-- Content Area -->
  {#if previewMode === 'webcam'}
  <div class="bg-zinc-100 aspect-square relative flex items-center justify-center overflow-hidden border-b border-zinc-200">
    {#if !isActive}
      <div class="flex flex-col items-center gap-3">
        <div class="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-400">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14v-4z"/><rect x="3" y="6" width="12" height="12" rx="2" ry="2"/><line x1="3" y1="3" x2="21" y2="21"/></svg>
        </div>
        <p class="text-sm font-medium text-zinc-400">
          {#if !isModelTrained}
            Train model to enable preview
          {:else}
            Turn on camera to test
          {/if}
        </p>
      </div>
    {/if}
    <!-- svelte-ignore a11y-media-has-caption -->
    <video bind:this={video} class="w-full h-full object-cover transform -scale-x-100 {isActive ? 'block' : 'hidden'}" playsinline autoplay muted></video>
  </div>
  {:else if previewMode === 'canvas'}
  <div class="bg-zinc-100 aspect-square relative flex items-center justify-center border-b border-zinc-200">
    <canvas 
      bind:this={drawCanvas} 
      width="224" 
      height="224"
      class="w-full h-full bg-black touch-none cursor-crosshair"
      on:mousedown={startDrawing}
      on:mousemove={draw}
      on:mouseup={stopDrawing}
      on:mouseleave={stopDrawing}
      on:touchstart={startDrawing}
      on:touchmove={draw}
      on:touchend={stopDrawing}
      on:touchcancel={stopDrawing}
    ></canvas>
    
    <button 
      on:click={clearCanvas}
      class="absolute top-3 right-3 bg-white/90 hover:bg-white text-zinc-600 text-xs font-semibold px-3 py-1.5 rounded-lg shadow-sm border border-zinc-200 transition-all z-10">
      {$t("clear") || "Limpar"}
    </button>
    
    {#if !isModelTrained}
      <div class="absolute inset-0 bg-white/80 backdrop-blur-[2px] flex flex-col items-center justify-center gap-3 z-20">
        <div class="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-400">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
        </div>
        <p class="text-sm font-medium text-zinc-500">Train model to enable drawing preview</p>
      </div>
    {/if}
  </div>
  {:else}
    <slot></slot>
  {/if}

  <!-- Output Area -->
  <div class="px-6 py-5 bg-white flex flex-col gap-3">

    <div class="text-sm font-semibold uppercase text-zinc-400 tracking-widest mb-2">Output</div>
    
    <div class="flex flex-col gap-2.5">
      {#each outputRows as pred}
        {@const isTop = pred.confidence > 0 && pred.confidence === Math.max(...outputRows.map(c => c.confidence))}
        <div class="w-full">
            <div class="flex justify-between text-xs mb-1.5">
                <span class="font-semibold {isTop ? 'text-indigo-700' : 'text-zinc-600'}">{pred.label}</span>
                <span class="font-bold {isTop ? 'text-indigo-700' : 'text-zinc-500'}">{pred.confidence}%</span>
            </div>
            <div class="w-full bg-zinc-100 h-2 rounded-full overflow-hidden">
                <div class="h-full rounded-full transition-all duration-500 {isTop ? 'bg-indigo-500' : 'bg-zinc-300'}" style="width: {pred.confidence}%"></div>
            </div>
        </div>
      {/each}
    </div>
  </div>
</div>
