/**
 * Domain-specific preprocessing transforms applied to canvas input
 * BEFORE it reaches `embedPixels`. Returning a transformed
 * `HTMLCanvasElement` (rather than a tensor) keeps this module
 * TF.js-free and composes with the existing inference path: the
 * result is fed straight back into `tf.browser.fromPixels`.
 */

/**
 * Replicate classic MNIST preprocessing so live canvas drawings land
 * in the same distribution as the training PNGs.
 *
 * Steps (matching LeCun et al. 1998, "Gradient-Based Learning Applied
 * to Document Recognition", section on preprocessing):
 *   1. Locate the bounding box of non-background pixels.
 *   2. Scale that bbox to fit a 20×20 region, preserving aspect ratio.
 *   3. Paste into a 28×28 frame centered on the digit's center of mass.
 *
 * The output is a 28×28 canvas, which `embedPixels` will then bilinearly
 * upscale to 224×224 — producing the same blur signature as the
 * training images (which are themselves 28×28 upscaled the same way).
 *
 * Why this matters: without preprocessing, a "5" drawn 150 px tall with
 * sharp edges has an embedding nothing like a 28×28 MNIST "5" upscaled
 * to 224×224. With it, they land in neighbouring regions of feature
 * space and the classifier suddenly works.
 */
export function preprocessMnistCanvas(source: HTMLCanvasElement): HTMLCanvasElement {
  const srcW = source.width;
  const srcH = source.height;
  const srcCtx = source.getContext('2d', { willReadFrequently: true });

  const out = document.createElement('canvas');
  out.width = 28;
  out.height = 28;
  const outCtx = out.getContext('2d')!;
  outCtx.fillStyle = '#000000';
  outCtx.fillRect(0, 0, 28, 28);

  if (!srcCtx) return out;

  // 1. Find bounding box of "ink" pixels. Canvas is white-on-black,
  //    matching MNIST's raw PNG polarity (luminance > threshold ⇒ ink).
  const imgData = srcCtx.getImageData(0, 0, srcW, srcH);
  const data = imgData.data;
  const INK_THRESHOLD = 30;

  let minX = srcW, minY = srcH, maxX = -1, maxY = -1;
  for (let y = 0; y < srcH; y++) {
    for (let x = 0; x < srcW; x++) {
      const i = (y * srcW + x) * 4;
      // R+G+B stroke on black background; division avoided for speed.
      if (data[i] + data[i + 1] + data[i + 2] > INK_THRESHOLD * 3) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  // Empty drawing → return the blank 28×28 frame (prediction will be
  // whatever the model says for a black square; better than crashing).
  if (maxX < 0) return out;

  const bboxW = maxX - minX + 1;
  const bboxH = maxY - minY + 1;

  // 2. Extract bbox → intermediate canvas → fit into 20×20 preserving AR.
  const crop = document.createElement('canvas');
  crop.width = bboxW;
  crop.height = bboxH;
  crop.getContext('2d')!.putImageData(
    srcCtx.getImageData(minX, minY, bboxW, bboxH),
    0, 0,
  );

  const scale = 20 / Math.max(bboxW, bboxH);
  const targetW = Math.max(1, Math.round(bboxW * scale));
  const targetH = Math.max(1, Math.round(bboxH * scale));

  // First pass: draw centered by bbox (so COM computation below reads
  // meaningful pixels). Smoothing on — we want the soft edges MNIST has.
  outCtx.imageSmoothingEnabled = true;
  outCtx.imageSmoothingQuality = 'high';
  const bboxDx = (28 - targetW) / 2;
  const bboxDy = (28 - targetH) / 2;
  outCtx.drawImage(crop, bboxDx, bboxDy, targetW, targetH);

  // 3. Compute center of mass and re-draw shifted so COM lands on (14,14).
  //    This is the step that makes MNIST so consistent — and the step
  //    that's missing from naïve canvas → MNIST pipelines.
  const frame = outCtx.getImageData(0, 0, 28, 28);
  const fdata = frame.data;
  let sumX = 0, sumY = 0, sumI = 0;
  for (let y = 0; y < 28; y++) {
    for (let x = 0; x < 28; x++) {
      const i = (y * 28 + x) * 4;
      const lum = fdata[i] + fdata[i + 1] + fdata[i + 2];
      if (lum > 0) {
        sumX += x * lum;
        sumY += y * lum;
        sumI += lum;
      }
    }
  }

  if (sumI > 0) {
    const comX = sumX / sumI;
    const comY = sumY / sumI;
    const shiftX = Math.round(14 - comX);
    const shiftY = Math.round(14 - comY);
    if (shiftX !== 0 || shiftY !== 0) {
      outCtx.fillStyle = '#000000';
      outCtx.fillRect(0, 0, 28, 28);
      outCtx.drawImage(crop, bboxDx + shiftX, bboxDy + shiftY, targetW, targetH);
    }
  }

  return out;
}
