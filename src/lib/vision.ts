/**
 * Lightweight, dependency-free visual fingerprint engine.
 *
 * A product enrolled with the camera is reduced to a compact descriptor of
 * illumination-robust channels:
 *
 *  1. `hist`     — 64-bin (4x4x4) histogram of *chromaticity* (r,g,b normalised
 *                  by their sum) accumulate-weighted by pixel saturation, so
 *                  neutral background pixels barely contribute. Hue is what
 *                  separates "red cola can" from "green shampoo bottle".
 *  2. `chromaGrid` — 6x6 spatial grid of saturation-weighted mean chromaticity,
 *                  capturing *where* the coloured regions sit (packaging layout).
 *  3. `grayGrid` — 6x6 grid of mean saturation, spotting pale/grey products.
 *  4. `shape`    — 6x6 grid of relative gradient energy (silhouette + print).
 *
 * The distance is a weighted sum of four 0..1 sub-distances with empirically
 * calibrated normalisation constants, mapped to a 0..1 similarity score.
 * The exact same code runs in the browser (descriptor extraction from a live
 * <video> frame) and on the server (ranking a query against all fingerprints).
 */

export const DESCRIPTOR_VERSION = 2;

export type ProductDescriptor = {
  v: typeof DESCRIPTOR_VERSION;
  aspect: number;
  hist: number[];
  chromaGrid: number[];
  grayGrid: number[];
  shape: number[];
};

export type PixelBuffer = {
  data: Uint8ClampedArray;
  width: number;
  height: number;
};

const SAMPLE = 32; // descriptor is computed on a 32x32 centre-cropped sample
const GRID = 6; // 6x6 spatial grid (~5.3px cells at 32px)
const HIST_LEVELS = 4; // 4x4x4 = 64 chromaticity bins
const EPS = 1 / 255;

const WEIGHTS = { hist: 0.42, chromaGrid: 0.28, grayGrid: 0.14, shape: 0.16 };

// Calibration constants: how much raw difference counts as a full 1.0 sub-score.
const CAL = { chromaGrid: 0.38, grayGrid: 0.45, shape: 0.55 };

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

function chromaticity(r: number, g: number, b: number): [number, number, number] {
  const sum = r + g + b + EPS;
  return [r / sum, g / sum, b / sum];
}

/** Centre-crops the frame to a square and box-samples it down to SAMPLE x SAMPLE RGBA. */
function normalizeSample(pixels: PixelBuffer): PixelBuffer {
  const size = SAMPLE;
  const side = Math.min(pixels.width, pixels.height);
  const offsetX = Math.floor((pixels.width - side) / 2);
  const offsetY = Math.floor((pixels.height - side) / 2);
  const out = new Uint8ClampedArray(size * size * 4);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const startX = offsetX + Math.floor((x * side) / size);
      const endX = Math.max(startX + 1, offsetX + Math.floor(((x + 1) * side) / size));
      const startY = offsetY + Math.floor((y * side) / size);
      const endY = Math.max(startY + 1, offsetY + Math.floor(((y + 1) * side) / size));
      let r = 0;
      let g = 0;
      let b = 0;
      let count = 0;
      for (let sy = startY; sy < Math.min(endY, pixels.height); sy += 1) {
        for (let sx = startX; sx < Math.min(endX, pixels.width); sx += 1) {
          const i = (sy * pixels.width + sx) * 4;
          r += pixels.data[i];
          g += pixels.data[i + 1];
          b += pixels.data[i + 2];
          count += 1;
        }
      }
      const target = (y * size + x) * 4;
      const safe = count || 1;
      out[target] = r / safe;
      out[target + 1] = g / safe;
      out[target + 2] = b / safe;
      out[target + 3] = 255;
    }
  }

  return { data: out, width: size, height: size };
}

export function computeDescriptor(pixels: PixelBuffer): ProductDescriptor {
  const sample = normalizeSample(pixels);
  const { data, width, height } = sample;

  const hist = new Array<number>(HIST_LEVELS ** 3).fill(0);
  const chromaGrid = new Array<number>(GRID * GRID * 3).fill(0);
  const grayGrid = new Array<number>(GRID * GRID).fill(0);
  const shape = new Array<number>(GRID * GRID).fill(0);
  const cellWeight = new Array<number>(GRID * GRID).fill(0);
  const cellCount = new Array<number>(GRID * GRID).fill(0);

  const luma = new Float32Array(width * height);
  for (let i = 0; i < width * height; i += 1) {
    luma[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
  }

  let histWeightTotal = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      const r = data[i * 4];
      const g = data[i * 4 + 1];
      const b = data[i * 4 + 2];
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const saturation = (max - min) / 255;

      const cell =
        Math.min(GRID - 1, Math.floor((y * GRID) / height)) * GRID +
        Math.min(GRID - 1, Math.floor((x * GRID) / width));

      if (saturation > 0.02) {
        const [cr, cg, cb] = chromaticity(r, g, b);
        const ri = Math.min(HIST_LEVELS - 1, Math.floor(cr * HIST_LEVELS));
        const gi = Math.min(HIST_LEVELS - 1, Math.floor(cg * HIST_LEVELS));
        const bi = Math.min(HIST_LEVELS - 1, Math.floor(cb * HIST_LEVELS));
        hist[(ri * HIST_LEVELS + gi) * HIST_LEVELS + bi] += saturation;
        histWeightTotal += saturation;

        chromaGrid[cell * 3] += cr * saturation;
        chromaGrid[cell * 3 + 1] += cg * saturation;
        chromaGrid[cell * 3 + 2] += cb * saturation;
        cellWeight[cell] += saturation;
      }

      grayGrid[cell] += saturation;
      cellCount[cell] += 1;

      const dx = luma[i - (x > 0 ? 1 : 0)] - luma[i + (x < width - 1 ? 1 : 0)];
      const dy = luma[i - (y > 0 ? width : 0)] - luma[i + (y < height - 1 ? width : 0)];
      shape[cell] += Math.abs(dx) + Math.abs(dy);
    }
  }

  // Normalise histogram (L1) — falls back to an achromatic descriptor if the
  // product is essentially grayscale.
  if (histWeightTotal < 0.02) {
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const i = (y * width + x) * 4;
        const [cr, cg, cb] = chromaticity(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
        const ri = Math.min(HIST_LEVELS - 1, Math.floor(cr * HIST_LEVELS));
        const gi = Math.min(HIST_LEVELS - 1, Math.floor(cg * HIST_LEVELS));
        const bi = Math.min(HIST_LEVELS - 1, Math.floor(cb * HIST_LEVELS));
        hist[(ri * HIST_LEVELS + gi) * HIST_LEVELS + bi] += 1;
        histWeightTotal += 1;
      }
    }
  }
  for (let i = 0; i < hist.length; i += 1) hist[i] /= histWeightTotal || 1;

  for (let cell = 0; cell < GRID * GRID; cell += 1) {
    const weight = cellWeight[cell];
    if (weight > 0.001) {
      chromaGrid[cell * 3] /= weight;
      chromaGrid[cell * 3 + 1] /= weight;
      chromaGrid[cell * 3 + 2] /= weight;
    } else {
      // achromatic cell: use the (neutral) chromaticity of the average colour
      chromaGrid[cell * 3] = 1 / 3;
      chromaGrid[cell * 3 + 1] = 1 / 3;
      chromaGrid[cell * 3 + 2] = 1 / 3;
    }
    grayGrid[cell] /= Math.max(1, cellCount[cell]);
  }

  const maxShape = Math.max(...shape) || 1;
  for (let cell = 0; cell < shape.length; cell += 1) shape[cell] /= maxShape;

  return { v: DESCRIPTOR_VERSION, aspect: 1, hist, chromaGrid, grayGrid, shape };
}

function l1(a: number[], b: number[]) {
  const len = Math.min(a.length, b.length);
  let sum = 0;
  for (let i = 0; i < len; i += 1) sum += Math.abs(a[i] - b[i]);
  return len ? sum / len : 0;
}

/** Returns a 0..1 distance: 0 == identical fingerprint, 1 == maximally different. */
export function descriptorDistance(a: ProductDescriptor, b: ProductDescriptor): number {
  let histDiff = 0;
  const histLen = Math.min(a.hist.length, b.hist.length);
  for (let i = 0; i < histLen; i += 1) histDiff += Math.abs(a.hist[i] - b.hist[i]);
  const histScore = clamp01(histDiff / 2); // L1 of two normalised histograms is <= 2

  const chromaScore = clamp01(l1(a.chromaGrid, b.chromaGrid) / CAL.chromaGrid);
  const grayScore = clamp01(l1(a.grayGrid, b.grayGrid) / CAL.grayGrid);
  const shapeScore = clamp01(l1(a.shape, b.shape) / CAL.shape);

  const distance =
    WEIGHTS.hist * histScore +
    WEIGHTS.chromaGrid * chromaScore +
    WEIGHTS.grayGrid * grayScore +
    WEIGHTS.shape * shapeScore;

  return clamp01(distance);
}

export function descriptorSimilarity(a: ProductDescriptor, b: ProductDescriptor): number {
  return clamp01(1 - descriptorDistance(a, b));
}

export function isDescriptor(value: unknown): value is ProductDescriptor {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ProductDescriptor>;
  return (
    candidate.v === DESCRIPTOR_VERSION &&
    Array.isArray(candidate.hist) &&
    Array.isArray(candidate.chromaGrid) &&
    Array.isArray(candidate.grayGrid) &&
    Array.isArray(candidate.shape)
  );
}
