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

    const generator = new ImageGenerator({ apiKey: 'test-key', keyType: 'GEMINI_API_KEY' });
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

test('default resolution is 2K when resolution is omitted', async () => {
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

    const generator = new ImageGenerator({ apiKey: 'test-key', keyType: 'GEMINI_API_KEY' });
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
      '2K',
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

    const generator = new ImageGenerator({ apiKey: 'test-key', keyType: 'GEMINI_API_KEY' });
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
