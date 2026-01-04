import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';
import jpeg from 'jpeg-js';
import { PNG } from 'pngjs';

import {
  processIconFile,
  processIconImage,
  type RgbaImage,
} from '../src/iconProcessor.js';

function createSolidImage(
  width: number,
  height: number,
  rgba: [number, number, number, number],
): RgbaImage {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = rgba[0];
    data[i + 1] = rgba[1];
    data[i + 2] = rgba[2];
    data[i + 3] = rgba[3];
  }
  return { width, height, data };
}

function setPixel(
  image: RgbaImage,
  x: number,
  y: number,
  rgba: [number, number, number, number],
) {
  const idx = (y * image.width + x) * 4;
  image.data[idx] = rgba[0];
  image.data[idx + 1] = rgba[1];
  image.data[idx + 2] = rgba[2];
  image.data[idx + 3] = rgba[3];
}

function fillRect(
  image: RgbaImage,
  left: number,
  top: number,
  width: number,
  height: number,
  rgba: [number, number, number, number],
) {
  for (let y = top; y < top + height; y++) {
    for (let x = left; x < left + width; x++) {
      setPixel(image, x, y, rgba);
    }
  }
}

function fillCircle(
  image: RgbaImage,
  centerX: number,
  centerY: number,
  radius: number,
  rgba: [number, number, number, number],
) {
  const r2 = radius * radius;
  for (let y = centerY - radius; y <= centerY + radius; y++) {
    for (let x = centerX - radius; x <= centerX + radius; x++) {
      const dx = x - centerX;
      const dy = y - centerY;
      if (dx * dx + dy * dy <= r2) {
        setPixel(image, x, y, rgba);
      }
    }
  }
}

function getPixel(image: RgbaImage, x: number, y: number) {
  const idx = (y * image.width + x) * 4;
  return {
    r: image.data[idx],
    g: image.data[idx + 1],
    b: image.data[idx + 2],
    a: image.data[idx + 3],
  };
}

test('processIconImage crops to icon component and resizes', () => {
  const bg: [number, number, number, number] = [250, 250, 250, 255];
  const icon: [number, number, number, number] = [0, 128, 255, 255];
  const text: [number, number, number, number] = [0, 0, 0, 255];

  const img = createSolidImage(200, 140, bg);
  fillRect(img, 60, 20, 80, 80, icon);
  fillRect(img, 20, 120, 160, 12, text);

  const out = processIconImage(img, {
    size: 64,
    transparentBackground: false,
    paddingRatio: 0,
  });

  assert.equal(out.width, 64);
  assert.equal(out.height, 64);

  const corner = getPixel(out, 0, 0);
  assert.equal(corner.r, icon[0]);
  assert.equal(corner.g, icon[1]);
  assert.equal(corner.b, icon[2]);
  assert.equal(corner.a, 255);

  const bottomCenter = getPixel(out, 32, 63);
  assert.equal(bottomCenter.r, icon[0]);
  assert.equal(bottomCenter.g, icon[1]);
  assert.equal(bottomCenter.b, icon[2]);
});

test('processIconImage uses edge-key color for cropping (no alpha removal yet)', () => {
  const bg: [number, number, number, number] = [10, 20, 30, 255];
  const fg: [number, number, number, number] = [200, 20, 20, 255];

  const img = createSolidImage(120, 120, bg);
  fillCircle(img, 60, 60, 40, fg);

  const out = processIconImage(img, {
    size: 64,
    transparentBackground: true,
    paddingRatio: 0,
  });

  assert.equal(out.width, 64);
  assert.equal(out.height, 64);

  const corner = getPixel(out, 0, 0);
  assert.equal(corner.r, bg[0]);
  assert.equal(corner.g, bg[1]);
  assert.equal(corner.b, bg[2]);
  assert.equal(corner.a, 255);

  const center = getPixel(out, 32, 32);
  assert.equal(center.a, 255);
  assert.ok(center.r > 100);
});

test('processIconFile preserves original and writes processed output', async () => {
  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'nb-icon-'));
  const inputPath = path.join(tmpDir, 'input.jpg');
  const bg: [number, number, number, number] = [12, 24, 36, 255];
  const fg: [number, number, number, number] = [240, 20, 20, 255];

  const img = createSolidImage(140, 140, bg);
  fillCircle(img, 70, 70, 45, fg);

  const encodedJpeg = jpeg.encode(
    { data: Buffer.from(img.data), width: img.width, height: img.height },
    100,
  ).data;
  await fs.promises.writeFile(inputPath, encodedJpeg);

  const outputPath = await processIconFile(inputPath, {
    size: 32,
    transparentBackground: true,
    outputFormat: 'png',
    paddingRatio: 0,
    overwrite: false,
  });

  assert.ok(fs.existsSync(inputPath));
  assert.ok(outputPath.endsWith('_icon_32.png'));
  const outPng = PNG.sync.read(await fs.promises.readFile(outputPath));
  assert.equal(outPng.width, 32);
  assert.equal(outPng.height, 32);
  assert.equal(outPng.data[3], 255);
});
