import * as fs from 'fs';
import * as path from 'path';
import jpeg from 'jpeg-js';
import { PNG } from 'pngjs';

export type ImageFileFormat = 'png' | 'jpeg';

export interface RgbaImage {
  width: number;
  height: number;
  data: Uint8Array; // RGBA, length = width * height * 4
}

export interface IconProcessOptions {
  size: number;
  transparentBackground?: boolean;
  paddingRatio?: number; // default 0.06
  backgroundThreshold?: number; // default derived from edge variance
  skipCropIfSquare?: boolean; // default true
}

interface Rgb {
  r: number;
  g: number;
  b: number;
}

interface Bounds {
  left: number;
  top: number;
  right: number; // exclusive
  bottom: number; // exclusive
}

const DEFAULT_PADDING_RATIO = 0.06;

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

function detectFormatFromBuffer(buffer: Buffer): ImageFileFormat | undefined {
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return 'jpeg';
  }

  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'png';
  }

  return undefined;
}

export async function decodeImageFile(
  filePath: string,
): Promise<{ image: RgbaImage; format: ImageFileFormat }> {
  const buffer = await fs.promises.readFile(filePath);
  const format = detectFormatFromBuffer(buffer);
  if (!format) {
    throw new Error(`Unsupported image format for ${filePath}`);
  }

  if (format === 'png') {
    const decoded = PNG.sync.read(buffer);
    return {
      format,
      image: {
        width: decoded.width,
        height: decoded.height,
        data: Uint8Array.from(decoded.data),
      },
    };
  }

  const decoded = jpeg.decode(buffer, { useTArray: true });
  if (!decoded || !decoded.data) {
    throw new Error(`Failed to decode JPEG image for ${filePath}`);
  }

  return {
    format,
    image: {
      width: decoded.width,
      height: decoded.height,
      data: Uint8Array.from(decoded.data),
    },
  };
}

export function encodePng(image: RgbaImage): Buffer {
  const png = new PNG({ width: image.width, height: image.height });
  png.data = Buffer.from(image.data);
  return PNG.sync.write(png);
}

export function encodeJpeg(
  image: RgbaImage,
  quality: number = 92,
  matte: Rgb = { r: 255, g: 255, b: 255 },
): Buffer {
  const flattened = Buffer.alloc(image.data.length);
  for (let i = 0; i < image.data.length; i += 4) {
    const alpha = image.data[i + 3] / 255;
    flattened[i] = Math.round(image.data[i] * alpha + matte.r * (1 - alpha));
    flattened[i + 1] = Math.round(
      image.data[i + 1] * alpha + matte.g * (1 - alpha),
    );
    flattened[i + 2] = Math.round(
      image.data[i + 2] * alpha + matte.b * (1 - alpha),
    );
    flattened[i + 3] = 0xff;
  }
  const encoded = jpeg.encode(
    { data: flattened, width: image.width, height: image.height },
    quality,
  );
  return encoded.data;
}

function quantizeRgb(rgb: Rgb): number {
  const r = rgb.r >>> 3;
  const g = rgb.g >>> 3;
  const b = rgb.b >>> 3;
  return (r << 10) | (g << 5) | b;
}

function distRgb(a: Rgb, b: Rgb): number {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function getPixelRgb(image: RgbaImage, x: number, y: number): Rgb {
  const idx = (y * image.width + x) * 4;
  return {
    r: image.data[idx],
    g: image.data[idx + 1],
    b: image.data[idx + 2],
  };
}

function edgePixels(image: RgbaImage): Array<{ x: number; y: number }> {
  const pixels: Array<{ x: number; y: number }> = [];
  const w = image.width;
  const h = image.height;

  for (let x = 0; x < w; x++) {
    pixels.push({ x, y: 0 });
    if (h > 1) pixels.push({ x, y: h - 1 });
  }
  for (let y = 1; y < h - 1; y++) {
    pixels.push({ x: 0, y });
    if (w > 1) pixels.push({ x: w - 1, y });
  }

  return pixels;
}

export function estimateEdgeKeyColor(image: RgbaImage): Rgb {
  const counts = new Map<number, { count: number; r: number; g: number; b: number }>();
  for (const { x, y } of edgePixels(image)) {
    const rgb = getPixelRgb(image, x, y);
    const q = quantizeRgb(rgb);
    const current = counts.get(q);
    if (!current) {
      counts.set(q, { count: 1, r: rgb.r, g: rgb.g, b: rgb.b });
    } else {
      current.count += 1;
      current.r += rgb.r;
      current.g += rgb.g;
      current.b += rgb.b;
    }
  }

  let best: { count: number; r: number; g: number; b: number } | undefined;
  for (const entry of counts.values()) {
    if (!best || entry.count > best.count) best = entry;
  }

  if (!best) return { r: 255, g: 255, b: 255 };

  return {
    r: Math.round(best.r / best.count),
    g: Math.round(best.g / best.count),
    b: Math.round(best.b / best.count),
  };
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo]!;
  const t = idx - lo;
  return sorted[lo]! * (1 - t) + sorted[hi]! * t;
}

function deriveEdgeTolerance(image: RgbaImage, keyColor: Rgb): number {
  const distances: number[] = [];
  for (const { x, y } of edgePixels(image)) {
    distances.push(distRgb(getPixelRgb(image, x, y), keyColor));
  }
  const p95 = percentile(distances, 0.95);
  return clampInt(Math.ceil(p95 + 6), 10, 80);
}

export function applyKeyColorTransparency(
  image: RgbaImage,
  keyColor: Rgb,
  tolerance: number,
): RgbaImage {
  const out = {
    width: image.width,
    height: image.height,
    data: Uint8Array.from(image.data),
  };
  const data = out.data;
  for (let i = 0; i < data.length; i += 4) {
    const rgb = { r: data[i], g: data[i + 1], b: data[i + 2] };
    if (distRgb(rgb, keyColor) <= tolerance) {
      data[i + 3] = 0;
    }
  }
  return out;
}

function buildForegroundMask(
  image: RgbaImage,
  keyColor: Rgb,
  threshold: number,
): Uint8Array {
  const width = image.width;
  const height = image.height;
  const background = new Uint8Array(width * height);

  const withinKey = (x: number, y: number) =>
    distRgb(getPixelRgb(image, x, y), keyColor) <= threshold;

  const queue = new Int32Array(width * height);
  let qHead = 0;
  let qTail = 0;

  const enqueue = (x: number, y: number) => {
    const idx = y * width + x;
    if (background[idx]) return;
    if (!withinKey(x, y)) return;
    background[idx] = 1;
    queue[qTail++] = idx;
  };

  for (let x = 0; x < width; x++) {
    enqueue(x, 0);
    if (height > 1) enqueue(x, height - 1);
  }
  for (let y = 1; y < height - 1; y++) {
    enqueue(0, y);
    if (width > 1) enqueue(width - 1, y);
  }

  while (qHead < qTail) {
    const idx = queue[qHead++]!;
    const x = idx % width;
    const y = (idx - x) / width;

    if (x > 0) enqueue(x - 1, y);
    if (x + 1 < width) enqueue(x + 1, y);
    if (y > 0) enqueue(x, y - 1);
    if (y + 1 < height) enqueue(x, y + 1);
  }

  const foreground = new Uint8Array(width * height);
  for (let i = 0; i < foreground.length; i++) {
    foreground[i] = background[i] ? 0 : 1;
  }
  return foreground;
}

function pickBestComponentBounds(
  mask: Uint8Array,
  width: number,
  height: number,
): Bounds | null {
  const visited = new Uint8Array(mask.length);
  const neighbors = [
    [-1, -1],
    [0, -1],
    [1, -1],
    [-1, 0],
    [1, 0],
    [-1, 1],
    [0, 1],
    [1, 1],
  ];

  let best: { bounds: Bounds; score: number } | null = null;

  const queue = new Int32Array(width * height);
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || visited[start]) continue;

    let qHead = 0;
    let qTail = 0;
    queue[qTail++] = start;
    visited[start] = 1;

    let area = 0;
    let left = width;
    let top = height;
    let right = 0;
    let bottom = 0;

    while (qHead < qTail) {
      const idx = queue[qHead++]!;
      area += 1;
      const x = idx % width;
      const y = (idx - x) / width;

      if (x < left) left = x;
      if (y < top) top = y;
      if (x + 1 > right) right = x + 1;
      if (y + 1 > bottom) bottom = y + 1;

      for (const [dx, dy] of neighbors) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const nIdx = ny * width + nx;
        if (!mask[nIdx] || visited[nIdx]) continue;
        visited[nIdx] = 1;
        queue[qTail++] = nIdx;
      }
    }

    const compWidth = right - left;
    const compHeight = bottom - top;
    if (compWidth < 6 || compHeight < 6) continue;

    const aspect = compWidth / compHeight;
    const aspectPenalty = 1 / (1 + Math.abs(Math.log2(aspect)));
    const score = area * aspectPenalty;
    if (!best || score > best.score) {
      best = {
        bounds: { left, top, right, bottom },
        score,
      };
    }
  }

  return best?.bounds ?? null;
}

function squareCropBounds(
  bounds: Bounds,
  width: number,
  height: number,
  paddingRatio: number,
): Bounds {
  const bWidth = bounds.right - bounds.left;
  const bHeight = bounds.bottom - bounds.top;
  const baseSize = Math.max(bWidth, bHeight);
  const paddedSize = Math.max(
    1,
    Math.ceil(baseSize * (1 + 2 * paddingRatio)),
  );

  const centerX = (bounds.left + bounds.right) / 2;
  const centerY = (bounds.top + bounds.bottom) / 2;

  let left = Math.round(centerX - paddedSize / 2);
  let top = Math.round(centerY - paddedSize / 2);

  left = clampInt(left, 0, Math.max(0, width - paddedSize));
  top = clampInt(top, 0, Math.max(0, height - paddedSize));

  return {
    left,
    top,
    right: Math.min(width, left + paddedSize),
    bottom: Math.min(height, top + paddedSize),
  };
}

export function cropImage(image: RgbaImage, bounds: Bounds): RgbaImage {
  const outWidth = bounds.right - bounds.left;
  const outHeight = bounds.bottom - bounds.top;
  const out = new Uint8Array(outWidth * outHeight * 4);
  const src = image.data;

  for (let y = 0; y < outHeight; y++) {
    const srcY = bounds.top + y;
    const srcRowStart = (srcY * image.width + bounds.left) * 4;
    const outRowStart = y * outWidth * 4;
    out.set(
      src.subarray(srcRowStart, srcRowStart + outWidth * 4),
      outRowStart,
    );
  }

  return { width: outWidth, height: outHeight, data: out };
}

export function resizeBilinear(
  image: RgbaImage,
  targetWidth: number,
  targetHeight: number,
): RgbaImage {
  if (targetWidth <= 0 || targetHeight <= 0) {
    throw new Error('Invalid target size for resize');
  }

  if (image.width === targetWidth && image.height === targetHeight) {
    return { width: image.width, height: image.height, data: Uint8Array.from(image.data) };
  }

  const out = new Uint8Array(targetWidth * targetHeight * 4);
  const src = image.data;

  const xScale = image.width / targetWidth;
  const yScale = image.height / targetHeight;

  for (let y = 0; y < targetHeight; y++) {
    const srcY = (y + 0.5) * yScale - 0.5;
    const y0 = clampInt(Math.floor(srcY), 0, image.height - 1);
    const y1 = clampInt(y0 + 1, 0, image.height - 1);
    const wy = srcY - y0;

    for (let x = 0; x < targetWidth; x++) {
      const srcX = (x + 0.5) * xScale - 0.5;
      const x0 = clampInt(Math.floor(srcX), 0, image.width - 1);
      const x1 = clampInt(x0 + 1, 0, image.width - 1);
      const wx = srcX - x0;

      const idx00 = (y0 * image.width + x0) * 4;
      const idx10 = (y0 * image.width + x1) * 4;
      const idx01 = (y1 * image.width + x0) * 4;
      const idx11 = (y1 * image.width + x1) * 4;

      const outIdx = (y * targetWidth + x) * 4;

      for (let c = 0; c < 4; c++) {
        const v00 = src[idx00 + c]!;
        const v10 = src[idx10 + c]!;
        const v01 = src[idx01 + c]!;
        const v11 = src[idx11 + c]!;
        const v0 = v00 * (1 - wx) + v10 * wx;
        const v1 = v01 * (1 - wx) + v11 * wx;
        out[outIdx + c] = Math.round(v0 * (1 - wy) + v1 * wy);
      }
    }
  }

  return { width: targetWidth, height: targetHeight, data: out };
}

export function processIconImage(
  input: RgbaImage,
  options: IconProcessOptions,
): RgbaImage {
  const transparentBackground = Boolean(options.transparentBackground);
  const skipCropIfSquare = options.skipCropIfSquare !== false;

  if (skipCropIfSquare && input.width === input.height) {
    return resizeBilinear(input, options.size, options.size);
  }

  const paddingRatio =
    options.paddingRatio ?? (transparentBackground ? 0.04 : DEFAULT_PADDING_RATIO);

  const keyColor = estimateEdgeKeyColor(input);
  const derivedTol = deriveEdgeTolerance(input, keyColor);

  const backgroundThreshold = clampInt(
    options.backgroundThreshold ?? Math.max(16, Math.floor(derivedTol + 4)),
    10,
    140,
  );

  const mask = buildForegroundMask(input, keyColor, backgroundThreshold);

  const bestBounds =
    pickBestComponentBounds(mask, input.width, input.height) ??
    ({ left: 0, top: 0, right: input.width, bottom: input.height } satisfies Bounds);

  const squareBounds = squareCropBounds(
    bestBounds,
    input.width,
    input.height,
    paddingRatio,
  );

  const cropped = cropImage(input, squareBounds);
  return resizeBilinear(cropped, options.size, options.size);
}

export async function processIconFile(
  inputPath: string,
  options: IconProcessOptions & {
    outputFormat: ImageFileFormat;
    overwrite?: boolean;
    outputSuffix?: string;
  },
): Promise<string> {
  const { image } = await decodeImageFile(inputPath);
  const processed = processIconImage(image, options);

  const inputDir = path.dirname(inputPath);
  const inputBase = path.parse(inputPath).name;
  const ext = options.outputFormat === 'png' ? '.png' : '.jpg';

  const overwrite = options.overwrite !== false;
  const sameExt = path.extname(inputPath).toLowerCase() === ext;

  const resolveUniquePath = (baseName: string) => {
    let candidate = path.join(inputDir, `${baseName}${ext}`);
    if (!fs.existsSync(candidate)) return candidate;
    for (let i = 1; i < 10_000; i++) {
      candidate = path.join(inputDir, `${baseName}_${i}${ext}`);
      if (!fs.existsSync(candidate)) return candidate;
    }
    throw new Error('Failed to pick a unique output filename');
  };

  const outputPath =
    overwrite && sameExt && !options.outputSuffix
      ? inputPath
      : resolveUniquePath(
          `${inputBase}${options.outputSuffix ?? `_icon_${options.size}`}`,
        );

  const buffer =
    options.outputFormat === 'png' ? encodePng(processed) : encodeJpeg(processed);

  await fs.promises.writeFile(outputPath, buffer);
  return outputPath;
}
