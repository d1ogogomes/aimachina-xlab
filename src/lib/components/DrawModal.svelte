<script lang="ts">
  import { createEventDispatcher, onDestroy } from 'svelte';
  import { t } from '../i18n';

  export let classId: number;
  export let className: string;
  /** Pen thickness — MNIST mode uses a thicker pen so strokes survive downscaling. */
  export let strokeWidth: number = 12;
  /** Optional preprocess hook applied to canvas before generating the data URL. */
  export let preprocess: ((canvas: HTMLCanvasElement) => HTMLCanvasElement) | null = null;

  const dispatch = createEventDispatcher<{
    capture: { classId: number; images: string[] };
    close: void;
  }>();

  let drawCanvas: HTMLCanvasElement;
  let ctx: CanvasRenderingContext2D | null = null;
  let isDrawing = false;
  let savedImages: string[] = [];
  let hasStrokes = false;

  // Canvas colour settings
  const BG_COLOR = '#000000';
  const STROKE_COLOR = '#ffffff';
  const CANVAS_SIZE = 224;

  function initCanvas() {
    if (drawCanvas && !ctx) {
      ctx = drawCanvas.getContext('2d', { willReadFrequently: true });
      clearCanvas();
    }
  }

  // Reactive init: drawCanvas may bind after first render
  $: if (drawCanvas) initCanvas();

  function clearCanvas() {
    if (!ctx || !drawCanvas) return;
    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(0, 0, drawCanvas.width, drawCanvas.height);
    hasStrokes = false;
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
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = STROKE_COLOR;

    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y);
    hasStrokes = true;
  }

  function saveCurrentDrawing() {
    if (!drawCanvas || !hasStrokes) return;
    const canvasToSave = preprocess ? preprocess(drawCanvas) : drawCanvas;
    const dataUrl = canvasToSave.toDataURL('image/png');
    savedImages = [...savedImages, dataUrl];
    clearCanvas();
  }

  function removeImage(index: number) {
    savedImages = savedImages.filter((_, i) => i !== index);
  }

  function saveAndClose() {
    // If there are unsaved strokes on the canvas, save them first
    if (hasStrokes && drawCanvas) {
      const canvasToSave = preprocess ? preprocess(drawCanvas) : drawCanvas;
      const dataUrl = canvasToSave.toDataURL('image/png');
      savedImages = [...savedImages, dataUrl];
    }
    if (savedImages.length > 0) {
      dispatch('capture', { classId, images: savedImages });
    }
    close();
  }

  function close() {
    dispatch('close');
  }

  onDestroy(() => {
    ctx = null;
  });
</script>

<!-- Backdrop -->
<div class="fixed inset-0 bg-ink/60 flex items-center justify-center p-4 backdrop-blur-sm transition-opacity" style="z-index: var(--z-modal)">
  <!-- Modal -->
  <div class="bg-surface rounded-xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col fade-up">
    <!-- Header -->
    <div class="px-4 py-3 border-b border-hairline flex items-center justify-between bg-sunken">
      <div class="flex items-center gap-2">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-cv"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
        <h3 class="font-semibold text-ink-muted">{$t("canvas")} - {className}</h3>
      </div>
      <button on:click={close} class="text-ink-faint hover:text-ink-muted p-1 rounded-md hover:bg-sunken transition-colors" aria-label="Close draw modal">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
      </button>
    </div>

    <!-- Canvas Area -->
    <div class="relative bg-ink aspect-square flex items-center justify-center overflow-hidden">
      <canvas
        bind:this={drawCanvas}
        width={CANVAS_SIZE}
        height={CANVAS_SIZE}
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

      <!-- Clear button -->
      <button
        on:click={clearCanvas}
        class="absolute top-3 right-3 bg-surface hover:bg-surface text-ink-muted text-xs font-semibold px-3 py-1.5 rounded-lg shadow-sm border border-hairline transition-all z-10"
      >
        {$t("clear")}
      </button>

      <!-- Saved count badge -->
      <div class="absolute bottom-4 left-4 bg-ink/50 text-white text-xs font-medium px-2 py-1 rounded backdrop-blur-md">
        {savedImages.length} {$t("samples").toLowerCase()}
      </div>
    </div>

    <!-- Controls -->
    <div class="p-4 flex items-center justify-center gap-3 bg-surface">
      <button
        on:click={saveCurrentDrawing}
        disabled={!hasStrokes}
        class="w-full max-w-[220px] py-2 px-4 bg-cv hover:bg-cv-ink disabled:bg-cv text-white text-sm font-medium rounded shadow-sm hover:shadow transition-all active:scale-95 flex items-center justify-center gap-2"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>
        {$t("draw_save_and_next")}
      </button>
    </div>

    <!-- Thumbnails -->
    {#if savedImages.length > 0}
    <div class="px-5 py-3 bg-sunken border-t border-hairline">
      <p class="text-xs font-semibold text-ink-faint uppercase tracking-wide mb-2">{$t("draw_saved_drawings")} ({savedImages.length})</p>
      <div class="flex gap-1.5 overflow-x-auto no-scrollbar">
        {#each savedImages as img, idx}
          <div class="relative group/thumb w-10 h-10 rounded overflow-hidden border border-hairline shrink-0 bg-ink">
            <img src={img} class="w-full h-full object-cover" alt="drawing {idx + 1}" />
            <button on:click={() => removeImage(idx)} class="absolute inset-0 bg-danger/80 text-white opacity-0 group-hover/thumb:opacity-100 flex items-center justify-center transition-opacity" aria-label="Remove drawing">
              <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>
        {/each}
      </div>
    </div>
    {/if}

    <!-- Footer -->
    <div class="px-5 py-4 border-t border-hairline flex justify-end gap-2 bg-sunken">
      <button on:click={close} class="px-4 py-2 text-sm font-medium text-ink-muted hover:bg-sunken rounded-lg transition-colors">
        {$t("reset_modal_cancel")}
      </button>
      <button on:click={saveAndClose} disabled={savedImages.length === 0 && !hasStrokes} class="px-4 py-2 text-sm font-medium bg-cv hover:bg-cv-ink disabled:bg-cv text-white rounded-lg transition-colors shadow-sm">
        {$t("draw_add_samples")}
      </button>
    </div>
  </div>
</div>

<style>
  .no-scrollbar::-webkit-scrollbar {
    display: none;
  }
  .no-scrollbar {
    -ms-overflow-style: none;
    scrollbar-width: none;
  }
</style>
