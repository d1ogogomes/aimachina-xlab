<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import type * as mobilenet from "@tensorflow-models/mobilenet";
  import { t } from "../i18n";
  import { predictConfidences, type PixelSource } from "../ml/tfjs";

  export let net: mobilenet.MobileNet | undefined;
  export let classifier: import("@tensorflow/tfjs").Sequential | null = null;
  export let classes: { id: number; name: string; confidence?: number }[] = [];
  export let isModelTrained: boolean = false;
  /**
   * Optional preprocess hook applied to the canvas BEFORE inference.
   * Used by MNIST mode to replicate the training distribution
   * (bbox-crop → 20×20 fit → COM-center → 28×28). Other modes pass
   * through untouched.
   */
  export let preprocess:
    | ((canvas: HTMLCanvasElement) => HTMLCanvasElement)
    | null = null;
  /**
   * Pen thickness on the draw canvas. MNIST digits occupy ~10-15% of
   * the bounding-box short side in their training set; when drawing
   * free-form in a 224×224 canvas we need a thicker pen than the
   * on-screen aesthetic would suggest so that after `preprocess`
   * rescales the bbox to 20×20, the on-canvas stroke lands at ~2-3 px,
   * matching the training distribution.
   */
  export let strokeWidth: number = 12;

  type OutputRow = { classId: number; label: string; confidence: number };

  type PreviewMode = "webcam" | "file" | "canvas";
  let previewMode: PreviewMode = "file";

  let video: HTMLVideoElement;
  let stream: MediaStream | null = null;
  let isActive = false;
  let requestRef: number;

  let loopGen = 0;
  let destroyed = false;

  let predictions: OutputRow[] = [];
  $: outputRows =
    previewMode === "webcam" || previewMode === "canvas"
      ? predictions
      : classes.map((c) => ({
          classId: c.id,
          label: c.name,
          confidence: c.confidence || 0,
        }));

  // Keep the predictions array aligned with `classes` without losing running confidences.
  $: if (classes) {
    if (predictions.length !== classes.length) {
      predictions = classes.map((c) => ({
        classId: c.id,
        label: c.name,
        confidence: 0,
      }));
    } else {
      predictions = predictions.map((p) => {
        const c = classes.find((cl) => cl.id === p.classId);
        return c ? { ...p, label: c.name } : p;
      });
    }
  }

  // ─── Lifecycle: mode + training transitions ───────────
  // Single reactive block that ONLY reads previewMode, isModelTrained,
  // lastMode, wasTrained. It deliberately does not read `isActive` or
  // `isPredictingCanvas` — those are owned by the imperative reconciler
  // below. If we read them here Svelte would re-run this block on every
  // camera state change and cancel the predict loop mid-flight.
  let lastMode: PreviewMode = previewMode;
  let wasTrained = false;
  $: {
    const modeChanged = previewMode !== lastMode;
    const trainedChanged = isModelTrained !== wasTrained;
    if (modeChanged) {
      loopGen++;
      if (requestRef) cancelAnimationFrame(requestRef);
      // `ctx` holds a reference to the canvas's 2D context. When the
      // canvas unmounts (leaving 'canvas' mode), that reference becomes
      // detached; keeping it would send drawing strokes into the void
      // on the next 'canvas' mount. Drop it so init re-runs.
      if (lastMode === "canvas") ctx = null;
      lastMode = previewMode;
    }
    if (trainedChanged) wasTrained = isModelTrained;
    if (modeChanged || trainedChanged) reconcileMode();
  }

  function reconcileMode() {
    if (previewMode === "file") {
      stopCamera();
      isPredictingCanvas = false;
      return;
    }

    if (previewMode === "canvas") {
      stopCamera();
      if (!isModelTrained) {
        isPredictingCanvas = false;
        return;
      }
      if (!isPredictingCanvas) {
        isPredictingCanvas = true;
        startPredictLoop();
      }
      return;
    }

    // webcam
    isPredictingCanvas = false;
    if (!isModelTrained) return;
    if (!isActive) {
      setTimeout(startCamera, 50);
    } else {
      // Camera already running (e.g., user loaded a demo dataset while
      // the webcam was open, then retrained). The loop exited on its
      // !isModelTrained guard and needs to be re-kicked now that
      // training is complete. loopGen was bumped by the caller or
      // bump it here to drop any straggler RAF.
      startPredictLoop();
    }
  }

  async function startCamera() {
    if (isActive) return;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
      });
      if (video && !destroyed) {
        video.srcObject = stream;
        video.play();
        isActive = true;
        startPredictLoop();
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
      stream.getTracks().forEach((track) => track.stop());
      stream = null;
    }
    if (previewMode !== "canvas") {
      predictions = predictions.map((p) => ({ ...p, confidence: 0 }));
    }
  }

  /**
   * Single prediction step. Captures (gen, classes, classifier, net) up-front
   * so all three race conditions below are impossible to commit wrong data:
   *   - gen mismatch (preview mode changed / component destroyed)
   *   - classes mutated during await
   *   - classifier disposed during await
   */
  async function predictFromSource(source: PixelSource, gen: number) {
    const currentNet = net;
    const currentClassifier = classifier;
    const classesSnapshot = classes;
    if (!currentNet || !currentClassifier) return;

    let confidences: Float32Array;
    try {
      confidences = await predictConfidences(
        currentNet,
        currentClassifier,
        source,
      );
    } catch (e) {
      // Most common cause: the classifier was disposed by the parent
      // (retrain, reset). Silently drop — the next loop iteration will
      // pick up the new classifier (or stop).
      if (!destroyed) console.debug("[preview] predict skipped:", e);
      return;
    }

    // If any of these changed while we were awaiting, the result is stale.
    if (gen !== loopGen || destroyed) return;
    if (classes !== classesSnapshot) return;

    const classIndexMap = Object.fromEntries(
      classesSnapshot.map((c, i) => [c.id, i]),
    );
    predictions = classesSnapshot.map((c) => ({
      classId: c.id,
      label: c.name,
      confidence: Math.round((confidences[classIndexMap[c.id]] || 0) * 100),
    }));
  }

  /** Entry point that captures the current generation for the loop.
   *  Always bumps loopGen so any in-flight predict from a previous
   *  loop (e.g. scheduled before retrain) is invalidated. */
  function startPredictLoop() {
    loopGen++;
    if (requestRef) cancelAnimationFrame(requestRef);
    const gen = loopGen;
    predictLoop(gen);
  }

  async function predictLoop(gen: number) {
    if (gen !== loopGen || destroyed) return;
    if (!net || !classifier || !isModelTrained) return;

    if (
      previewMode === "webcam" &&
      isActive &&
      video &&
      video.readyState === 4
    ) {
      await predictFromSource(video, gen);
    } else if (previewMode === "canvas" && isPredictingCanvas && drawCanvas) {
      const source = preprocess ? preprocess(drawCanvas) : drawCanvas;
      await predictFromSource(source, gen);
    }

    // Re-check after await: only the current generation re-schedules.
    if (gen !== loopGen || destroyed) return;
    if (
      (isActive && previewMode === "webcam") ||
      (isPredictingCanvas && previewMode === "canvas")
    ) {
      requestRef = requestAnimationFrame(() => predictLoop(gen));
    }
  }

  onMount(() => {
    if (isModelTrained) {
      if (previewMode === "webcam") startCamera();
      if (previewMode === "canvas") {
        isPredictingCanvas = true;
        startPredictLoop();
      }
    }
  });

  onDestroy(() => {
    destroyed = true;
    loopGen++;
    stopCamera();
    isPredictingCanvas = false;
  });

  // ─── Canvas drawing ──────────────────────────────────────────
  let drawCanvas: HTMLCanvasElement;
  let ctx: CanvasRenderingContext2D | null = null;
  let isDrawing = false;

  $: if (drawCanvas && previewMode === "canvas" && !ctx) {
    ctx = drawCanvas.getContext("2d", { willReadFrequently: true });
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
    e.preventDefault();

    const rect = drawCanvas.getBoundingClientRect();
    let clientX: number, clientY: number;

    if (e instanceof MouseEvent) {
      clientX = e.clientX;
      clientY = e.clientY;
    } else if (e.touches && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      return;
    }

    const scaleX = drawCanvas.width / rect.width;
    const scaleY = drawCanvas.height / rect.height;
    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;

    ctx.lineWidth = strokeWidth;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#ffffff";

    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function clearCanvas() {
    if (ctx && drawCanvas) {
      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, drawCanvas.width, drawCanvas.height);
    }
  }
</script>

<div
  class="bg-surface rounded-xl shadow-sm border border-hairline overflow-hidden flex flex-col"
>
  <!-- Input Selector -->
  <div
    id="cv-input-source"
    class="px-5 py-3 flex items-center justify-between bg-surface border-b border-hairline"
  >
    <span class="text-sm font-medium text-ink-faint">{$t("input_source")}</span>
    <select
      bind:value={previewMode}
      class="ml-auto text-sm border border-hairline bg-surface hover:bg-sunken rounded-lg px-3 py-1.5 outline-none font-medium text-ink-muted transition-colors cursor-pointer shadow-sm"
    >
      <option value="webcam">{$t("webcam")}</option>
      <option value="canvas">{$t("canvas") || "Desenhar"}</option>
      <option value="file">{$t("file")}</option>
    </select>
  </div>

  <!-- Content Area -->
  {#if previewMode === "webcam"}
    <div
      class="bg-sunken aspect-square relative flex items-center justify-center overflow-hidden border-b border-hairline"
    >
      {#if !isActive}
        <div class="flex flex-col items-center gap-3">
          <div
            class="w-12 h-12 rounded-full bg-ink flex items-center justify-center text-paper"
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
                d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14v-4z"
              /><rect x="3" y="6" width="12" height="12" rx="2" ry="2" /><line
                x1="3"
                y1="3"
                x2="21"
                y2="21"
              /></svg
            >
          </div>
          <p class="text-sm font-medium text-ink-faint">
            {#if !isModelTrained}
              Train model to enable preview
            {:else}
              Turn on camera to test
            {/if}
          </p>
        </div>
      {/if}
      <!-- svelte-ignore a11y-media-has-caption -->
      <video
        bind:this={video}
        class="w-full h-full object-cover transform -scale-x-100 {isActive
          ? 'block'
          : 'hidden'}"
        playsinline
        autoplay
        muted
      ></video>
    </div>
  {:else if previewMode === "canvas"}
    <div
      class="bg-sunken aspect-square relative flex items-center justify-center border-b border-hairline"
    >
      <canvas
        bind:this={drawCanvas}
        width="224"
        height="224"
        class="w-full h-full bg-ink touch-none cursor-crosshair"
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
        class="absolute top-3 right-3 bg-surface hover:bg-surface text-ink-muted text-xs font-semibold px-3 py-1.5 rounded-lg shadow-sm border border-hairline transition-all z-10"
      >
        {$t("clear") || "Limpar"}
      </button>

      {#if !isModelTrained}
        <div
          class="absolute inset-0 bg-surface backdrop-blur-[2px] flex flex-col items-center justify-center gap-3 z-20"
        >
          <div
            class="w-12 h-12 rounded-full bg-ink flex items-center justify-center text-paper"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              ><path d="M12 20h9" /><path
                d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"
              /></svg
            >
          </div>
          <p class="text-sm font-medium text-ink-faint">
            Train model to enable drawing preview
          </p>
        </div>
      {/if}
    </div>
  {:else}
    <slot></slot>
  {/if}

  <!-- Output Area -->
  <div id="cv-output" class="px-6 py-5 bg-surface flex flex-col gap-3">
    <div
      class="text-sm font-semibold uppercase text-ink-faint tracking-widest mb-2"
    >
      Output
    </div>

    <div class="flex flex-col gap-2.5">
      {#each outputRows as pred}
        {@const isTop =
          pred.confidence > 0 &&
          pred.confidence === Math.max(...outputRows.map((c) => c.confidence))}
        <div class="w-full">
          <div class="flex justify-between text-xs mb-1.5">
            <span
              class="font-semibold {isTop
                ? 'text-cv'
                : 'text-ink-muted'}">{pred.label}</span
            >
            <span
              class="font-bold {isTop ? 'text-cv' : 'text-ink-faint'}"
              >{pred.confidence}%</span
            >
          </div>
          <div class="w-full bg-sunken h-2 rounded-full overflow-hidden">
            <div
              class="h-full rounded-full transition-all duration-500 {isTop
                ? 'bg-cv'
                : 'bg-line'}"
              style="width: {pred.confidence}%"
            ></div>
          </div>
        </div>
      {/each}
    </div>
  </div>
</div>
