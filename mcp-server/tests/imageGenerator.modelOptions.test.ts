/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';

import { ImageGenerator } from '../src/imageGenerator.js';

const ONE_PIXEL_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7+e8kAAAAASUVORK5CYII=';

test('gemini-3.1-flash-image-preview supports 512 resolution and new aspect ratio', async () => {
  const originalModel = process.env.NANOBANANA_MODEL;
  const originalFetch = global.fetch;
  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'nb-gen-'));
  let requestBody: Record<string, unknown> | undefined;

  try {
    process.env.NANOBANANA_MODEL = 'gemini-3.1-flash-image-preview';
    global.fetch = async (_input, init) => {
      requestBody = JSON.parse(String(init?.body));
      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    inlineData: {
                      mimeType: 'image/png',
                      data: ONE_PIXEL_PNG_BASE64,
                    },
                  },
                ],
              },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    };

    const generator = new ImageGenerator({ apiKey: 'test-key' });
    const response = await generator.generateTextToImage({
      prompt: 'test image',
      mode: 'generate',
      resolution: '512',
      aspectRatio: '1:4',
      outputDir: tmpDir,
      fileFormat: 'png',
    });

    assert.equal(response.success, true);
    assert.equal(response.generatedFiles?.length, 1);
    assert.ok(response.generatedFiles?.[0]);
    assert.ok(fs.existsSync(response.generatedFiles![0]!));
    assert.equal(
      (requestBody?.generationConfig as { imageConfig?: { imageSize?: string } })
        ?.imageConfig?.imageSize,
      '512',
    );
    assert.equal(
      (requestBody?.generationConfig as { imageConfig?: { aspectRatio?: string } })
        ?.imageConfig?.aspectRatio,
      '1:4',
    );
  } finally {
    if (originalModel === undefined) {
      delete process.env.NANOBANANA_MODEL;
    } else {
      process.env.NANOBANANA_MODEL = originalModel;
    }
    global.fetch = originalFetch;
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  }
});

test('default resolution is 1K when resolution is omitted', async () => {
  const originalModel = process.env.NANOBANANA_MODEL;
  const originalFetch = global.fetch;
  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'nb-gen-'));
  let requestBody: Record<string, unknown> | undefined;

  try {
    process.env.NANOBANANA_MODEL = 'gemini-3.1-flash-image-preview';
    global.fetch = async (_input, init) => {
      requestBody = JSON.parse(String(init?.body));
      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    inlineData: {
                      mimeType: 'image/png',
                      data: ONE_PIXEL_PNG_BASE64,
                    },
                  },
                ],
              },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    };

    const generator = new ImageGenerator({ apiKey: 'test-key' });
    const response = await generator.generateTextToImage({
      prompt: 'test image',
      mode: 'generate',
      outputDir: tmpDir,
      fileFormat: 'png',
    });

    assert.equal(response.success, true);
    assert.equal(
      (requestBody?.generationConfig as { imageConfig?: { imageSize?: string } })
        ?.imageConfig?.imageSize,
      '1K',
    );
  } finally {
    if (originalModel === undefined) {
      delete process.env.NANOBANANA_MODEL;
    } else {
      process.env.NANOBANANA_MODEL = originalModel;
    }
    global.fetch = originalFetch;
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  }
});

test('512 resolution is rejected for gemini-3-pro-image-preview', async () => {
  const originalModel = process.env.NANOBANANA_MODEL;
  const originalFetch = global.fetch;
  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'nb-gen-'));
  let fetchCalled = false;

  try {
    process.env.NANOBANANA_MODEL = 'gemini-3-pro-image-preview';
    global.fetch = async () => {
      fetchCalled = true;
      throw new Error('fetch should not be called');
    };

    const generator = new ImageGenerator({ apiKey: 'test-key' });
    const response = await generator.generateTextToImage({
      prompt: 'test image',
      mode: 'generate',
      resolution: '512',
      outputDir: tmpDir,
    });

    assert.equal(response.success, false);
    assert.equal(fetchCalled, false);
    assert.match(
      response.error || '',
      /Resolution 512 is only supported by model gemini-3\.1-flash-image-preview/,
    );
  } finally {
    if (originalModel === undefined) {
      delete process.env.NANOBANANA_MODEL;
    } else {
      process.env.NANOBANANA_MODEL = originalModel;
    }
    global.fetch = originalFetch;
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  }
});

test('validateAuthentication only accepts NANOBANANA_API_KEY', () => {
  const originalNanoBananaKey = process.env.NANOBANANA_API_KEY;
  const originalGeminiKey = process.env.GEMINI_API_KEY;
  const originalGoogleKey = process.env.GOOGLE_API_KEY;
  const originalNanoBananaGeminiKey = process.env.NANOBANANA_GEMINI_API_KEY;
  const originalNanoBananaGoogleKey = process.env.NANOBANANA_GOOGLE_API_KEY;

  try {
    process.env.NANOBANANA_API_KEY = 'primary-key';
    process.env.GEMINI_API_KEY = 'legacy-gemini-key';
    process.env.GOOGLE_API_KEY = 'legacy-google-key';
    process.env.NANOBANANA_GEMINI_API_KEY = 'legacy-prefixed-gemini-key';
    process.env.NANOBANANA_GOOGLE_API_KEY = 'legacy-prefixed-google-key';

    assert.deepEqual(ImageGenerator.validateAuthentication(), {
      apiKey: 'primary-key',
    });

    delete process.env.NANOBANANA_API_KEY;

    assert.throws(
      () => ImageGenerator.validateAuthentication(),
      /Please set NANOBANANA_API_KEY environment variable/,
    );
  } finally {
    if (originalNanoBananaKey === undefined) {
      delete process.env.NANOBANANA_API_KEY;
    } else {
      process.env.NANOBANANA_API_KEY = originalNanoBananaKey;
    }

    if (originalGeminiKey === undefined) {
      delete process.env.GEMINI_API_KEY;
    } else {
      process.env.GEMINI_API_KEY = originalGeminiKey;
    }

    if (originalGoogleKey === undefined) {
      delete process.env.GOOGLE_API_KEY;
    } else {
      process.env.GOOGLE_API_KEY = originalGoogleKey;
    }

    if (originalNanoBananaGeminiKey === undefined) {
      delete process.env.NANOBANANA_GEMINI_API_KEY;
    } else {
      process.env.NANOBANANA_GEMINI_API_KEY = originalNanoBananaGeminiKey;
    }

    if (originalNanoBananaGoogleKey === undefined) {
      delete process.env.NANOBANANA_GOOGLE_API_KEY;
    } else {
      process.env.NANOBANANA_GOOGLE_API_KEY = originalNanoBananaGoogleKey;
    }
  }
});
