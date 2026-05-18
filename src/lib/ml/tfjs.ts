import * as tf from '@tensorflow/tfjs';
import * as mobilenet from '@tensorflow-models/mobilenet';

/**
 * Shared TF.js helpers for AIMachina XLab.
 *
 * Centralizes everything that was previously duplicated between
 * App.svelte and PreviewCard.svelte:
 *   - MobileNet loading
 *   - single / batched embedding extraction
 *   - classifier build + train
 *   - occlusion-based XAI
 *
 * All tensor-creating helpers wrap work in `tf.tidy` so intermediate
 * tensors are freed even on error paths.
 */

export const MOBILENET_INPUT = 224;
export const FEATURE_SIZE = 1024; // MobileNet v1, α=1.0 → 1024-d embedding

export type PixelSource = HTMLImageElement | HTMLVideoElement | HTMLCanvasElement;

/** Load MobileNet once; caller is responsible for caching the instance. */
export function loadBackbone(): Promise<mobilenet.MobileNet> {
  return mobilenet.load({ version: 1, alpha: 1.0 });
}

/** Resolve an <img> element from any URL (blob:, data:, http:, bundled asset…). */
export function loadImageFromUrl(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${src.slice(0, 80)}`));
    img.src = src;
  });
}

/**
 * Embed a single pixel source into [1, FEATURE_SIZE].
 * The returned tensor lives outside tidy — callers must dispose it
 * (or feed it to another tidy/predict call that consumes it).
 */
export function embedPixels(net: mobilenet.MobileNet, source: PixelSource): tf.Tensor2D {
  return tf.tidy(() => {
    const pixels = tf.browser.fromPixels(source);
    const resized = tf.image.resizeBilinear(pixels, [MOBILENET_INPUT, MOBILENET_INPUT]);
    const activation = net.infer(resized, true) as tf.Tensor;
    const flat = activation.reshape([1, activation.size]);
    if (flat.shape[1] !== FEATURE_SIZE) {
      throw new Error(`Unexpected MobileNet embedding size: ${flat.shape[1]}`);
    }
    return flat as tf.Tensor2D;
  });
}

/**
 * Embed N canvases that are ALREADY MOBILENET_INPUT × MOBILENET_INPUT
 * in a single forward pass. Used by the occlusion heatmap to avoid
 * serial inference on every grid cell.
 */
export function embedBatchFromCanvases(
  net: mobilenet.MobileNet,
  canvases: HTMLCanvasElement[],
): tf.Tensor2D {
  return tf.tidy(() => {
    const stacked = tf.stack(canvases.map((c) => tf.browser.fromPixels(c))) as tf.Tensor4D;
    const activation = net.infer(stacked, true) as tf.Tensor;
    return activation.reshape([canvases.length, FEATURE_SIZE]) as tf.Tensor2D;
  });
}

/** Build + compile the classification head used on top of MobileNet embeddings. */
export function buildClassifier(numClasses: number): tf.Sequential {
  const model = tf.sequential({
    layers: [
      tf.layers.dense({
        units: 100,
        activation: 'relu',
        kernelInitializer: 'varianceScaling',
        inputShape: [FEATURE_SIZE],
      }),
      tf.layers.dense({
        units: numClasses,
        activation: 'softmax',
        kernelInitializer: 'varianceScaling',
      }),
    ],
  });
  model.compile({
    optimizer: tf.train.adam(0.0001),
    loss: 'categoricalCrossentropy',
    metrics: ['accuracy'],
  });
  return model;
}

/** Run the classifier on one source and return the raw confidences. */
export async function predictConfidences(
  net: mobilenet.MobileNet,
  classifier: tf.Sequential,
  source: PixelSource,
): Promise<Float32Array> {
  const embedding = embedPixels(net, source);
  try {
    const logits = classifier.predict(embedding) as tf.Tensor;
    try {
      return (await logits.data()) as Float32Array;
    } finally {
      logits.dispose();
    }
  } finally {
    embedding.dispose();
  }
}

// ─── XAI: occlusion heatmap ─────────────────────────────────────────────

export type OcclusionOptions = {
  imgSize?: number;
  patch?: number;
  stride?: number;
  /**
   * Max canvases per forward pass. Stacking all 50 inputs at once can
   * exceed WebGL texture memory on mobile / integrated GPUs
   * (observed GL_OUT_OF_MEMORY on iOS Safari with a single [50,224,224,3] tensor).
   * Chunking keeps the performance win from batching while bounding peak VRAM.
   */
  batchSize?: number;
};

export type OcclusionResult = {
  heatNorm: number[][];
  steps: number;
  imgSize: number;
  patch: number;
  stride: number;
};

function robustNorm(vals: number[]): number[] {
  const sorted = [...vals].sort((a, b) => a - b);
  const n = sorted.length;
  const lo = sorted[Math.floor(n * 0.05)];
  const hi = sorted[Math.floor(n * 0.95)];
  const range = Math.max(hi - lo, 1e-8);
  return vals.map((v) => Math.max(0, Math.min(1, (v - lo) / range)));
}

/**
 * Occlusion sensitivity map: mean-grey patch over a sliding grid,
 * scored by L2 distance in MobileNet embedding space vs. the unoccluded baseline.
 *
 * Runs inference in chunks (default 16) so peak WebGL memory is bounded
 * even for large grids, while still being ~1 order of magnitude faster
 * than the original one-at-a-time loop.
 */
export async function computeOcclusionMap(
  net: mobilenet.MobileNet,
  img: HTMLImageElement,
  opts: OcclusionOptions = {},
): Promise<OcclusionResult> {
  const imgSize = opts.imgSize ?? MOBILENET_INPUT;
  const patch = opts.patch ?? 80;
  const stride = opts.stride ?? 24;
  const batchSize = Math.max(1, opts.batchSize ?? 16);

  // Fail fast on nonsensical geometry instead of producing a garbled
  // [1,1] heatmap from `Math.floor((imgSize - patch) / stride) + 1`.
  if (imgSize <= 0 || patch <= 0 || stride <= 0) {
    throw new Error(`computeOcclusionMap: imgSize/patch/stride must be positive (got ${imgSize}/${patch}/${stride})`);
  }
  if (patch > imgSize) {
    throw new Error(`computeOcclusionMap: patch (${patch}) cannot exceed imgSize (${imgSize})`);
  }

  const steps = Math.floor((imgSize - patch) / stride) + 1;

  // Build baseline + one canvas per occlusion cell.
  const canvases: HTMLCanvasElement[] = [];

  const base = document.createElement('canvas');
  base.width = imgSize;
  base.height = imgSize;
  base.getContext('2d')!.drawImage(img, 0, 0, imgSize, imgSize);
  canvases.push(base);

  for (let row = 0; row < steps; row++) {
    for (let col = 0; col < steps; col++) {
      const c = document.createElement('canvas');
      c.width = imgSize;
      c.height = imgSize;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(img, 0, 0, imgSize, imgSize);
      ctx.fillStyle = 'rgb(128,128,128)';
      ctx.fillRect(col * stride, row * stride, patch, patch);
      canvases.push(c);
    }
  }

  // Chunked inference. Each chunk lives inside a tidy so its intermediate
  // tensors are freed before the next chunk allocates — peak memory is
  // bounded by `batchSize * 224 * 224 * 3 * 4 bytes` (~3 MB at batchSize=16).
  const data = new Float32Array(canvases.length * FEATURE_SIZE);
  for (let offset = 0; offset < canvases.length; offset += batchSize) {
    const chunk = canvases.slice(offset, offset + batchSize);
    const embeddings = embedBatchFromCanvases(net, chunk);
    try {
      const chunkData = (await embeddings.data()) as Float32Array;
      data.set(chunkData, offset * FEATURE_SIZE);
    } finally {
      embeddings.dispose();
    }
    // Yield to the browser so the spinner animates and the tab stays responsive.
    if (offset + batchSize < canvases.length) await tf.nextFrame();
  }

  // L2 distance against the first embedding (baseline).
  const heat: number[][] = Array.from({ length: steps }, () => Array(steps).fill(0));
  for (let i = 0; i < steps * steps; i++) {
    const off = (i + 1) * FEATURE_SIZE;
    let acc = 0;
    for (let k = 0; k < FEATURE_SIZE; k++) {
      const d = data[off + k] - data[k];
      acc += d * d;
    }
    heat[Math.floor(i / steps)][i % steps] = Math.sqrt(acc);
  }

  const normFlat = robustNorm(heat.flat());
  const heatNorm: number[][] = Array.from({ length: steps }, (_, r) =>
    Array.from({ length: steps }, (__, c) => normFlat[r * steps + c]),
  );

  return { heatNorm, steps, imgSize, patch, stride };
}

/**
 * Paint a green→yellow→red overlay onto a copy of `img` using the
 * heatmap produced by `computeOcclusionMap`. Returns a JPEG data URL.
 *
 * The occlusion grid usually has `stride < patch`, so any given pixel is
 * covered by multiple cells (≈ `(patch/stride)²` ≈ 11 at the default
 * 80/24 settings). Instead of painting each cell on top of the previous
 * one with α=0.5 — which saturates and quantises the colour in overlap
 * regions — we build a per-pixel importance map by averaging every cell
 * that covers the pixel, then render it as a single ImageData blit at
 * a fixed alpha. The result is a smooth, properly-weighted heatmap
 * that still benefits from the dense sampling the overlapping grid
 * provides.
 */
export function renderOcclusionOverlay(img: HTMLImageElement, result: OcclusionResult): string {
  const { heatNorm, steps, imgSize, patch, stride } = result;
  const origW = img.naturalWidth || img.width || imgSize;
  const origH = img.naturalHeight || img.height || imgSize;

  // 1. Accumulate per-pixel sum + coverage count at native occlusion
  //    resolution (imgSize × imgSize). Coverage outside the grid stays
  //    at count=0 and will be rendered fully transparent below.
  const npx = imgSize * imgSize;
  const sum = new Float32Array(npx);
  const count = new Uint16Array(npx);

  for (let row = 0; row < steps; row++) {
    const y0 = row * stride;
    const y1 = y0 + patch;
    for (let col = 0; col < steps; col++) {
      const v = heatNorm[row][col];
      const x0 = col * stride;
      const x1 = x0 + patch;
      for (let y = y0; y < y1; y++) {
        const rowBase = y * imgSize;
        for (let x = x0; x < x1; x++) {
          const idx = rowBase + x;
          sum[idx] += v;
          count[idx] += 1;
        }
      }
    }
  }

  // 2. Build an RGBA ImageData where each pixel = averaged importance,
  //    mapped through the same green → yellow → red ramp used before.
  const heatCanvas = document.createElement('canvas');
  heatCanvas.width = imgSize;
  heatCanvas.height = imgSize;
  const heatCtx = heatCanvas.getContext('2d')!;
  const imageData = heatCtx.createImageData(imgSize, imgSize);
  const px = imageData.data;
  const ALPHA = 128; // unchanged 50% opacity

  for (let i = 0; i < npx; i++) {
    const c = count[i];
    if (c === 0) {
      // outside grid → transparent (keeps image edges crisp)
      px[i * 4 + 3] = 0;
      continue;
    }
    const n = sum[i] / c;
    const r = Math.round(255 * Math.min(1, n * 2));
    const g = Math.round(255 * Math.max(0, 1 - n * 2));
    const base = i * 4;
    px[base] = r;
    px[base + 1] = g;
    px[base + 2] = 0;
    px[base + 3] = ALPHA;
  }
  heatCtx.putImageData(imageData, 0, 0);

  // 3. Composite onto the original image at its native resolution.
  //    drawImage with default smoothing gives us free bilinear upscaling
  //    of the heatmap, which is exactly what we want.
  const out = document.createElement('canvas');
  out.width = origW;
  out.height = origH;
  const ctx = out.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(img, 0, 0, origW, origH);
  ctx.drawImage(heatCanvas, 0, 0, origW, origH);

  return out.toDataURL('image/jpeg', 0.92);
}
