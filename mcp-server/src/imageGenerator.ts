/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { FileHandler } from './fileHandler.js';
import { Logger } from './logger.js';
import {
  ImageGenerationRequest,
  ImageGenerationResponse,
  AuthConfig,
  StorySequenceArgs,
  ImageResolution,
} from './types.js';
import { exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import jpeg from 'jpeg-js';
import { PNG } from 'pngjs';

const execAsync = promisify(exec);

// REST API response types
interface GeminiPart {
  text?: string;
  inlineData?: {
    mimeType: string;
    data: string;
  };
}

interface GeminiCandidate {
  content?: {
    parts?: GeminiPart[];
  };
}

interface GeminiResponse {
  candidates?: GeminiCandidate[];
  error?: {
    code: number;
    message: string;
    status: string;
  };
}

export class ImageGenerator {
  private apiKey: string;
  private modelName: string;
  private static readonly DEFAULT_MODEL = 'gemini-2.5-flash-image';
  private static readonly DEFAULT_RESOLUTION: ImageResolution = '2K';
  private static readonly DEFAULT_PARALLEL = 2;
  private static readonly API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

  constructor(authConfig: AuthConfig) {
    this.apiKey = authConfig.apiKey;
    this.modelName =
      process.env.NANOBANANA_MODEL || ImageGenerator.DEFAULT_MODEL;
    this.debug(`DEBUG - Using image model: ${this.modelName}`);
  }

  /**
   * Debug logging - only outputs if NANOBANANA_DEBUG environment variable is set
   */
  private debug(...args: unknown[]): void {
    if (process.env.NANOBANANA_DEBUG) {
      console.error(...args);
    }
  }

  private isGemini31FlashImagePreviewModel(): boolean {
    return this.modelName === 'gemini-3.1-flash-image-preview';
  }

  private validateResolutionForModel(resolution?: ImageResolution): void {
    if (resolution === '512' && !this.isGemini31FlashImagePreviewModel()) {
      throw new Error(
        'Resolution 512 is only supported by model gemini-3.1-flash-image-preview',
      );
    }
  }

  private getFormatFromMimeType(
    mimeType?: string,
  ): 'png' | 'jpeg' | undefined {
    if (!mimeType) return undefined;
    const normalized = mimeType.toLowerCase().split(';')[0]?.trim();
    if (normalized === 'image/png') return 'png';
    if (normalized === 'image/jpeg' || normalized === 'image/jpg') return 'jpeg';
    return undefined;
  }

  private getTargetFormatFromFilename(
    filename: string,
  ): 'png' | 'jpeg' | undefined {
    const ext = path.extname(filename).toLowerCase();
    if (ext === '.png') return 'png';
    if (ext === '.jpg' || ext === '.jpeg') return 'jpeg';
    return undefined;
  }

  private detectFormatFromBuffer(buffer: Buffer): 'png' | 'jpeg' | undefined {
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

  private convertImageBufferFormat(
    buffer: Buffer,
    from: 'png' | 'jpeg',
    to: 'png' | 'jpeg',
  ): Buffer {
    if (from === to) return buffer;

    if (from === 'jpeg' && to === 'png') {
      const decoded = jpeg.decode(buffer, { useTArray: true });
      if (!decoded || !decoded.data) {
        throw new Error('Failed to decode JPEG image');
      }

      const png = new PNG({ width: decoded.width, height: decoded.height });
      png.data = Buffer.from(decoded.data);
      return PNG.sync.write(png);
    }

    if (from === 'png' && to === 'jpeg') {
      const decoded = PNG.sync.read(buffer);
      const rgba = decoded.data;
      const flattened = Buffer.alloc(rgba.length);

      for (let i = 0; i < rgba.length; i += 4) {
        const alpha = rgba[i + 3] / 255;
        flattened[i] = Math.round(rgba[i] * alpha + 255 * (1 - alpha));
        flattened[i + 1] = Math.round(rgba[i + 1] * alpha + 255 * (1 - alpha));
        flattened[i + 2] = Math.round(rgba[i + 2] * alpha + 255 * (1 - alpha));
        flattened[i + 3] = 0xff;
      }

      const encoded = jpeg.encode(
        { data: flattened, width: decoded.width, height: decoded.height },
        92,
      );
      return encoded.data;
    }

    throw new Error(`Unsupported conversion from ${from} to ${to}`);
  }

  private ensureTargetImageFormat(
    buffer: Buffer,
    sourceMimeType: string | undefined,
    targetFormat: 'png' | 'jpeg' | undefined,
  ): Buffer {
    if (!targetFormat) return buffer;

    const formatFromMime = this.getFormatFromMimeType(sourceMimeType);
    const formatFromMagic = this.detectFormatFromBuffer(buffer);
    const sourceFormat = formatFromMagic ?? formatFromMime;

    if (formatFromMime && formatFromMagic && formatFromMime !== formatFromMagic) {
      this.debug('DEBUG - Image mimeType disagrees with magic bytes:', {
        mimeType: sourceMimeType,
        fromMime: formatFromMime,
        fromMagic: formatFromMagic,
      });
    }

    if (!sourceFormat || sourceFormat === targetFormat) return buffer;

    try {
      return this.convertImageBufferFormat(buffer, sourceFormat, targetFormat);
    } catch (error: unknown) {
      this.debug('DEBUG - Failed to convert image format, saving original:', {
        from: sourceFormat,
        to: targetFormat,
        error: error instanceof Error ? error.message : String(error),
      });
      return buffer;
    }
  }

  /**
   * Make a REST API call to Gemini
   */
  private async callGeminiRestApi(
    prompt: string,
    resolution?: ImageResolution,
    aspectRatio?: string,
    inputImageBase64?: string,
    inputImageMimeType?: string,
    seed?: number,
    referenceImagesData?: Array<{ data: string; mimeType: string }>,
  ): Promise<GeminiResponse> {
    const url = `${ImageGenerator.API_BASE_URL}/${this.modelName}:generateContent?key=${this.apiKey}`;

    // Build parts array
    const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];
    parts.push({ text: prompt });

    // Add input image if provided (for editing)
    if (inputImageBase64 && inputImageMimeType) {
      parts.push({
        inlineData: {
          mimeType: inputImageMimeType,
          data: inputImageBase64,
        },
      });
    }

    // Add reference images if provided (for generation)
    if (referenceImagesData && referenceImagesData.length > 0) {
      for (const refImage of referenceImagesData) {
        parts.push({
          inlineData: {
            mimeType: refImage.mimeType,
            data: refImage.data,
          },
        });
      }
    }

    // Build generationConfig based on model
    // gemini-2.5-flash-image: only supports aspectRatio
    // gemini-3 models: support aspectRatio and imageSize
    this.validateResolutionForModel(resolution);
    const isGemini3 = this.modelName.includes('gemini-3');

    interface ImageConfig {
      aspectRatio?: string;
      imageSize?: string;
    }

    const imageConfig: ImageConfig = {};

    if (aspectRatio) {
      imageConfig.aspectRatio = aspectRatio;
    }

    // Only add imageSize for Gemini 3 models
    if (isGemini3 && resolution) {
      imageConfig.imageSize = resolution;
    }

    const requestBody = {
      contents: [
        {
          role: 'user',
          parts,
        },
      ],
      generationConfig: {
        responseModalities: ['Image'],
        ...(Object.keys(imageConfig).length > 0 ? { imageConfig } : {}),
        ...(seed !== undefined ? { seed } : {}),
      },
    };

    this.debug('DEBUG - REST API URL:', url.replace(this.apiKey, '[REDACTED]'));
    this.debug('DEBUG - REST API Request Body:', JSON.stringify({
      ...requestBody,
      contents: requestBody.contents.map(c => ({
        ...c,
        parts: c.parts.map(p => {
          if ('inlineData' in p) {
            return { inlineData: { mimeType: p.inlineData.mimeType, data: `[BASE64: ${p.inlineData.data.length} chars]` } };
          }
          return p;
        }),
      })),
    }, null, 2));

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    const responseData = await response.json() as GeminiResponse;

    if (!response.ok) {
      this.debug('DEBUG - REST API Error Response:', JSON.stringify(responseData, null, 2));
      throw new Error(responseData.error?.message || `HTTP ${response.status}: ${response.statusText}`);
    }

    this.debug('DEBUG - REST API Response Status:', response.status);
    return responseData;
  }

  private async openImagePreview(filePath: string): Promise<void> {
    try {
      const platform = process.platform;
      let command: string;

      switch (platform) {
        case 'darwin': // macOS
          command = `open "${filePath}"`;
          break;
        case 'win32': // Windows
          command = `start "" "${filePath}"`;
          break;
        default: // Linux and others
          command = `xdg-open "${filePath}"`;
          break;
      }

      await execAsync(command);
      this.debug(`DEBUG - Opened preview for: ${filePath}`);
    } catch (error: unknown) {
      this.debug(
        `DEBUG - Failed to open preview for ${filePath}:`,
        error instanceof Error ? error.message : String(error),
      );
      // Don't throw - preview failure shouldn't break image generation
    }
  }

  private shouldAutoPreview(request: ImageGenerationRequest): boolean {
    // If --no-preview is explicitly set, never preview
    if (request.noPreview) {
      return false;
    }

    // Only preview when --preview flag is explicitly set
    if (request.preview) {
      return true;
    }

    // No auto-preview - images only open when explicitly requested
    return false;
  }

  private async handlePreview(
    files: string[],
    request: ImageGenerationRequest,
  ): Promise<void> {
    const shouldPreview = this.shouldAutoPreview(request);

    if (!shouldPreview || !files.length) {
      if (files.length > 1 && request.noPreview) {
        this.debug(
          `DEBUG - Auto-preview disabled for ${files.length} images (--no-preview specified)`,
        );
      }
      return;
    }

    this.debug(
      `DEBUG - ${request.preview ? 'Explicit' : 'Auto'}-opening ${files.length} image(s) for preview`,
    );

    // Open all generated images
    const previewPromises = files.map((file) => this.openImagePreview(file));
    await Promise.all(previewPromises);
  }

  static validateAuthentication(): AuthConfig {
    const nanoGeminiKey = process.env.NANOBANANA_GEMINI_API_KEY;
    if (nanoGeminiKey) {
      if (process.env.NANOBANANA_DEBUG) {
        console.error('✓ Found NANOBANANA_GEMINI_API_KEY environment variable');
      }
      return { apiKey: nanoGeminiKey, keyType: 'GEMINI_API_KEY' };
    }

    const nanoGoogleKey = process.env.NANOBANANA_GOOGLE_API_KEY;
    if (nanoGoogleKey) {
      if (process.env.NANOBANANA_DEBUG) {
        console.error('✓ Found NANOBANANA_GOOGLE_API_KEY environment variable');
      }
      return { apiKey: nanoGoogleKey, keyType: 'GOOGLE_API_KEY' };
    }

    const geminiKey = process.env.GEMINI_API_KEY;
    if (geminiKey) {
      if (process.env.NANOBANANA_DEBUG) {
        console.error(
          '✓ Found GEMINI_API_KEY environment variable (fallback)',
        );
      }
      return { apiKey: geminiKey, keyType: 'GEMINI_API_KEY' };
    }

    const googleKey = process.env.GOOGLE_API_KEY;
    if (googleKey) {
      if (process.env.NANOBANANA_DEBUG) {
        console.error(
          '✓ Found GOOGLE_API_KEY environment variable (fallback)',
        );
      }
      return { apiKey: googleKey, keyType: 'GOOGLE_API_KEY' };
    }

    throw new Error(
      'ERROR: No valid API key found. Please set NANOBANANA_GEMINI_API_KEY, NANOBANANA_GOOGLE_API_KEY, GEMINI_API_KEY, or GOOGLE_API_KEY environment variable.\n' +
        'For more details on authentication, visit: https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/authentication.md',
    );
  }

  private isValidBase64ImageData(data: string): boolean {
    // Check if data looks like base64 image data
    if (!data || data.length < 100) {
      return false; // Too short to be meaningful image data
    }

    // Check if it's valid base64 format
    const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
    if (!base64Regex.test(data)) {
      return false; // Not valid base64
    }

    // Additional check: base64 image data is typically quite long
    if (data.length < 1000) {
      if (process.env.NANOBANANA_DEBUG) {
        console.error(
          'DEBUG - Skipping short data that may not be image:',
          data.length,
          'characters',
        );
      }
      return false;
    }

    return true;
  }

  private buildBatchPrompts(request: ImageGenerationRequest): string[] {
    const prompts: string[] = [];
    const basePrompt = request.prompt;

    // If no batch options, return original prompt
    if (!request.styles && !request.variations && !request.outputCount) {
      return [basePrompt];
    }

    // Handle styles
    if (request.styles && request.styles.length > 0) {
      for (const style of request.styles) {
        prompts.push(`${basePrompt}, ${style} style`);
      }
    }

    // Handle variations
    if (request.variations && request.variations.length > 0) {
      const basePrompts = prompts.length > 0 ? prompts : [basePrompt];
      const variationPrompts: string[] = [];

      for (const baseP of basePrompts) {
        for (const variation of request.variations) {
          switch (variation) {
            case 'lighting':
              variationPrompts.push(`${baseP}, dramatic lighting`);
              variationPrompts.push(`${baseP}, soft lighting`);
              break;
            case 'angle':
              variationPrompts.push(`${baseP}, from above`);
              variationPrompts.push(`${baseP}, close-up view`);
              break;
            case 'color-palette':
              variationPrompts.push(`${baseP}, warm color palette`);
              variationPrompts.push(`${baseP}, cool color palette`);
              break;
            case 'composition':
              variationPrompts.push(`${baseP}, centered composition`);
              variationPrompts.push(`${baseP}, rule of thirds composition`);
              break;
            case 'mood':
              variationPrompts.push(`${baseP}, cheerful mood`);
              variationPrompts.push(`${baseP}, dramatic mood`);
              break;
            case 'season':
              variationPrompts.push(`${baseP}, in spring`);
              variationPrompts.push(`${baseP}, in winter`);
              break;
            case 'time-of-day':
              variationPrompts.push(`${baseP}, at sunrise`);
              variationPrompts.push(`${baseP}, at sunset`);
              break;
          }
        }
      }
      if (variationPrompts.length > 0) {
        prompts.splice(0, prompts.length, ...variationPrompts);
      }
    }

    // If no styles/variations but outputCount > 1, create simple variations
    if (
      prompts.length === 0 &&
      request.outputCount &&
      request.outputCount > 1
    ) {
      for (let i = 0; i < request.outputCount; i++) {
        prompts.push(basePrompt);
      }
    }

    // Limit to outputCount if specified
    if (request.outputCount && prompts.length > request.outputCount) {
      prompts.splice(request.outputCount);
    }

    return prompts.length > 0 ? prompts : [basePrompt];
  }

  private async generateSingleImage(
    currentPrompt: string,
    index: number,
    request: ImageGenerationRequest,
    outputPath: string,
    forceSuffix: boolean,
    referenceImagesData?: Array<{ data: string; mimeType: string }>,
  ): Promise<{ success: boolean; filePath?: string; error?: string }> {
    this.debug(
      `DEBUG - Generating variation ${index + 1}:`,
      currentPrompt,
    );

    // Prepare API call info for logging
    const resolution = request.resolution || ImageGenerator.DEFAULT_RESOLUTION;
    const isGemini3 = this.modelName.includes('gemini-3');
    const generationConfig: Record<string, unknown> = {
      responseModalities: ['Image'],
    };
    if (request.aspectRatio || (isGemini3 && resolution)) {
      const imageConfig: Record<string, unknown> = {};
      if (request.aspectRatio) imageConfig.aspectRatio = request.aspectRatio;
      if (isGemini3 && resolution) imageConfig.imageSize = resolution;
      generationConfig.imageConfig = imageConfig;
    }
    if (request.seed !== undefined) {
      generationConfig.seed = request.seed;
    }

    try {
      // Use REST API (retry once on failure)
      let response: GeminiResponse;
      try {
        response = await this.callGeminiRestApi(
          currentPrompt,
          resolution,
          request.aspectRatio,
          undefined,
          undefined,
          request.seed,
          referenceImagesData,
        );
      } catch (error: unknown) {
        const errorMessage = this.handleApiError(error);
        this.logRetry(
          'generate',
          request as unknown as Record<string, unknown>,
          {
            model: this.modelName,
            prompt: currentPrompt,
            resolution,
            aspectRatio: request.aspectRatio,
            hasInputImage: false,
            generationConfig,
          },
          errorMessage,
        );
        response = await this.callGeminiRestApi(
          currentPrompt,
          resolution,
          request.aspectRatio,
          undefined,
          undefined,
          request.seed,
          referenceImagesData,
        );
      }

      this.debug('DEBUG - API Response structure for variation', index + 1);

      if (response.candidates && response.candidates[0]?.content?.parts) {
        // Process image parts in the response
        for (const part of response.candidates[0].content.parts) {
          let imageBase64: string | undefined;

          if (part.inlineData?.data) {
            imageBase64 = part.inlineData.data;
            this.debug('DEBUG - Found image data in inlineData:', {
              length: imageBase64.length,
              mimeType: part.inlineData.mimeType,
            });
          } else if (part.text && this.isValidBase64ImageData(part.text)) {
            imageBase64 = part.text;
            this.debug(
              'DEBUG - Found image data in text field (fallback)',
            );
          }

          if (imageBase64) {
            const filenameSuffix =
              request.filename && request.filenameSuffixes?.[index] !== undefined
                ? request.filenameSuffixes[index]
                : undefined;
            const filename = FileHandler.generateFilename(
              request.styles || request.variations
                ? currentPrompt
                : request.prompt,
              request.fileFormat ?? 'jpeg',
              index,
              request.filename,
              forceSuffix,
              filenameSuffix,
              request.outputDir,
            );
            const inputBuffer = Buffer.from(imageBase64, 'base64');
            const targetFormat = this.getTargetFormatFromFilename(filename);
            const outputBuffer = this.ensureTargetImageFormat(
              inputBuffer,
              part.inlineData?.mimeType,
              targetFormat,
            );
            const fullPath = await FileHandler.saveImageBuffer(
              outputBuffer,
              outputPath,
              filename,
            );
            this.debug('DEBUG - Image saved to:', fullPath);

            // Calculate image file size and log
            const fileStats = fs.statSync(fullPath);
            const logEntry = Logger.createLogEntry(
              'generate',
              request as unknown as Record<string, unknown>,
              {
                model: this.modelName,
                prompt: currentPrompt,
                resolution,
                aspectRatio: request.aspectRatio,
                hasInputImage: false,
                generationConfig,
              },
              {
                success: true,
                imageSize: fileStats.size,
                filePath: fullPath,
              },
            );
            Logger.log(logEntry);

            return { success: true, filePath: fullPath };
          }
        }
      }

      // Log failure case
      const logEntry = Logger.createLogEntry(
        'generate',
        request as unknown as Record<string, unknown>,
        {
          model: this.modelName,
          prompt: currentPrompt,
          resolution,
          aspectRatio: request.aspectRatio,
          hasInputImage: false,
          generationConfig,
        },
        {
          success: false,
          error: 'No image data found in API response',
        },
      );
      Logger.log(logEntry);

      return { success: false, error: 'No image data found in API response' };
    } catch (error: unknown) {
      const errorMessage = this.handleApiError(error);
      this.debug(
        `DEBUG - Error generating variation ${index + 1}:`,
        errorMessage,
      );

      // Log error case
      const logEntry = Logger.createLogEntry(
        'generate',
        request as unknown as Record<string, unknown>,
        {
          model: this.modelName,
          prompt: currentPrompt,
          resolution,
          aspectRatio: request.aspectRatio,
          hasInputImage: false,
          generationConfig,
        },
        {
          success: false,
          error: errorMessage,
        },
      );
      Logger.log(logEntry);

      return { success: false, error: errorMessage };
    }
  }

  async generateTextToImage(
    request: ImageGenerationRequest,
  ): Promise<ImageGenerationResponse> {
    try {
      const outputPath = FileHandler.ensureOutputDirectory(request.outputDir);
      const generatedFiles: string[] = [];
      const prompts = this.buildBatchPrompts(request);
      const forceSuffix = Boolean(request.filename) && prompts.length > 1;
      let firstError: string | null = null;
      let referenceImagesData: Array<{ data: string; mimeType: string }> | undefined;
      if (request.referenceImages && request.referenceImages.length > 0) {
        if (request.referenceImages.length > 14) {
          return {
            success: false,
            message: 'Too many reference images provided',
            error: `Maximum 14 reference images allowed, but ${request.referenceImages.length} were provided`,
          };
        }

        this.debug(
          `DEBUG - Processing ${request.referenceImages.length} reference image(s)`,
        );

        referenceImagesData = [];
        for (const refImagePath of request.referenceImages) {
          const fileResult = FileHandler.findInputFile(refImagePath);
          if (!fileResult.found) {
            return {
              success: false,
              message: `Reference image not found: ${refImagePath}`,
              error: `Searched in: ${fileResult.searchedPaths.join(', ')}`,
            };
          }

          const imageBase64 = await FileHandler.readImageAsBase64(
            fileResult.filePath!,
          );
          const ext = fileResult.filePath!.toLowerCase().split('.').pop();
          const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';

          referenceImagesData.push({
            data: imageBase64,
            mimeType,
          });
        }

        this.debug(
          `DEBUG - Successfully loaded ${referenceImagesData.length} reference image(s)`,
        );
      }

      // Determine parallel count (default to 2 if not specified)
      const requestedParallel =
        request.parallel ?? ImageGenerator.DEFAULT_PARALLEL;
      const parallelCount = Math.min(
        Math.max(1, requestedParallel),
        8,
      );

      this.debug(
        `DEBUG - Generating ${prompts.length} image variation(s) with parallelism of ${parallelCount}`,
      );

      // Process prompts in batches based on parallelCount
      for (let i = 0; i < prompts.length; i += parallelCount) {
        const batch = prompts.slice(i, i + parallelCount);
        const batchPromises = batch.map((prompt, batchIndex) =>
          this.generateSingleImage(
            prompt,
            i + batchIndex,
            request,
            outputPath,
            forceSuffix,
            referenceImagesData,
          ),
        );

        const results = await Promise.all(batchPromises);

        // Process results
        for (const result of results) {
          if (result.success && result.filePath) {
            generatedFiles.push(result.filePath);
          } else if (result.error) {
            if (!firstError) {
              firstError = result.error;
            }
            // If auth-related, stop immediately
            if (result.error.toLowerCase().includes('authentication failed')) {
              return {
                success: false,
                message: 'Image generation failed',
                error: result.error,
              };
            }
          }
        }
      }

      if (generatedFiles.length === 0) {
        return {
          success: false,
          message: 'Failed to generate any images',
          error: firstError || 'No image data found in API responses',
        };
      }

      // Handle preview if requested
      await this.handlePreview(generatedFiles, request);

      return {
        success: true,
        message: `Successfully generated ${generatedFiles.length} image variation(s)`,
        generatedFiles,
      };
    } catch (error: unknown) {
      this.debug('DEBUG - Error in generateTextToImage:', error);
      return {
        success: false,
        message: 'Failed to generate image',
        error: this.handleApiError(error),
      };
    }
  }

  private handleApiError(error: unknown): string {
    // Ideal: Check for a specific error code or type from the SDK
    // Fallback: Check for revealing strings in the error message
    const errorMessage =
      error instanceof Error ? error.message : String(error).toLowerCase();

    if (errorMessage.includes('api key not valid')) {
      return 'Authentication failed: The provided API key is invalid. Please check your NANOBANANA_GEMINI_API_KEY environment variable.';
    }

    if (errorMessage.includes('permission denied')) {
      return 'Authentication failed: The provided API key does not have the necessary permissions for the Gemini API. Please check your Google Cloud project settings.';
    }

    if (errorMessage.includes('quota exceeded')) {
      return 'API quota exceeded. Please check your usage and limits in the Google Cloud console.';
    }

    // Check for GoogleGenerativeAIResponseError
    if (
      error &&
      typeof error === 'object' &&
      'response' in error &&
      error.response
    ) {
      const responseError = error as {
        response: { status: number; statusText: string };
      };
      const { status } = responseError.response;

      switch (status) {
        case 400:
          return 'The request was malformed. This may be due to an issue with the prompt. Please check for safety violations or unsupported content.';
        case 403: // General permission error if specific message not caught
          return 'Authentication failed. Please ensure your API key (e.g., NANOBANANA_GEMINI_API_KEY) is valid and has the necessary permissions.';
        case 500:
          return 'The image generation service encountered a temporary internal error. Please try again later.';
        default:
          return `API request failed with status ${status}. Please check your connection and API key.`;
      }
    }

    // Fallback for other error types
    return `An unexpected error occurred: ${errorMessage}`;
  }

  private logRetry(
    type: 'generate' | 'edit' | 'restore' | 'story',
    request: Record<string, unknown>,
    apiCallInfo: {
      model: string;
      prompt: string;
      resolution?: string;
      aspectRatio?: string;
      hasInputImage: boolean;
      generationConfig: Record<string, unknown>;
    },
    errorMessage: string,
  ): void {
    const logEntry = Logger.createLogEntry(
      type,
      request,
      apiCallInfo,
      {
        success: false,
        error: `Retrying after API error: ${errorMessage}`,
      },
    );
    Logger.log(logEntry);
  }

  async generateStorySequence(
    request: ImageGenerationRequest,
    args?: StorySequenceArgs,
  ): Promise<ImageGenerationResponse> {
    try {
      const outputPath = FileHandler.ensureOutputDirectory(request.outputDir);
      const steps = request.outputCount || 4;
      const type = args?.type || 'story';
      const style = args?.style || 'consistent';
      const transition = args?.transition || 'smooth';
      const forceSuffix = Boolean(request.filename) && steps > 1;
      const resolution = request.resolution || ImageGenerator.DEFAULT_RESOLUTION;
      const requestedParallel =
        request.parallel ?? ImageGenerator.DEFAULT_PARALLEL;
      const parallelCount = Math.min(Math.max(1, requestedParallel), 8);
      const generatedFiles: Array<string | null> = Array(steps).fill(null);
      let firstError: string | null = null;

      this.debug(
        `DEBUG - Generating ${steps}-step ${type} sequence with parallelism of ${parallelCount}`,
      );

      // Process reference images if provided
      let referenceImagesData: Array<{ data: string; mimeType: string }> | undefined;
      if (request.referenceImages && request.referenceImages.length > 0) {
        const maxReferenceImages = 14;
        if (request.referenceImages.length > maxReferenceImages) {
          return {
            success: false,
            message: 'Too many reference images provided',
            error: `Maximum ${maxReferenceImages} reference images allowed for story sequences, but ${request.referenceImages.length} were provided`,
          };
        }

        this.debug(
          `DEBUG - Processing ${request.referenceImages.length} reference image(s)`,
        );

        referenceImagesData = [];
        for (const refImagePath of request.referenceImages) {
          const fileResult = FileHandler.findInputFile(refImagePath);
          if (!fileResult.found) {
            return {
              success: false,
              message: `Reference image not found: ${refImagePath}`,
              error: `Searched in: ${fileResult.searchedPaths.join(', ')}`,
            };
          }

          const imageBase64 = await FileHandler.readImageAsBase64(
            fileResult.filePath!,
          );
          const ext = fileResult.filePath!.toLowerCase().split('.').pop();
          const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';

          referenceImagesData.push({
            data: imageBase64,
            mimeType,
          });
        }

        this.debug(
          `DEBUG - Successfully loaded ${referenceImagesData.length} reference image(s)`,
        );
      }

      type StoryStepResult = {
        success: boolean;
        filePath?: string;
        error?: string;
        authError?: boolean;
      };

      const generateStep = async (
        stepIndex: number,
        stepReferenceImagesData?: Array<{ data: string; mimeType: string }>,
      ): Promise<StoryStepResult> => {
        const stepNumber = stepIndex + 1;
        let stepPrompt = `${request.prompt}, step ${stepNumber} of ${steps}`;

        // Add context based on type
        switch (type) {
          case 'story':
            stepPrompt += `, narrative sequence, ${style} art style`;
            break;
          case 'process':
            stepPrompt += `, procedural step, instructional illustration`;
            break;
          case 'tutorial':
            stepPrompt += `, tutorial step, educational diagram`;
            break;
          case 'timeline':
            stepPrompt += `, chronological progression, timeline visualization`;
            break;
        }

        // Add transition context
        if (stepIndex > 0) {
          stepPrompt += `, ${transition} transition from previous step`;
        }

        this.debug(`DEBUG - Generating step ${stepNumber}: ${stepPrompt}`);

        const storyGenerationConfig: Record<string, unknown> = {
          responseModalities: ['Image'],
        };
        const isGemini3Story = this.modelName.includes('gemini-3');
        if (request.aspectRatio || (isGemini3Story && resolution)) {
          const imageConfig: Record<string, unknown> = {};
          if (request.aspectRatio) imageConfig.aspectRatio = request.aspectRatio;
          if (isGemini3Story && resolution) imageConfig.imageSize = resolution;
          storyGenerationConfig.imageConfig = imageConfig;
        }
        if (request.seed !== undefined) {
          storyGenerationConfig.seed = request.seed;
        }

        try {
          // Use REST API
          let response: GeminiResponse;
          try {
            response = await this.callGeminiRestApi(
              stepPrompt,
              resolution,
              request.aspectRatio,
              undefined,
              undefined,
              request.seed,
              stepReferenceImagesData,
            );
          } catch (error: unknown) {
            const errorMessage = this.handleApiError(error);
            this.logRetry(
              'story',
              request as unknown as Record<string, unknown>,
              {
                model: this.modelName,
                prompt: stepPrompt,
                resolution,
                aspectRatio: request.aspectRatio,
                hasInputImage: false,
                generationConfig: storyGenerationConfig,
              },
              errorMessage,
            );
            response = await this.callGeminiRestApi(
              stepPrompt,
              resolution,
              request.aspectRatio,
              undefined,
              undefined,
              request.seed,
              stepReferenceImagesData,
            );
          }

          if (response.candidates && response.candidates[0]?.content?.parts) {
            for (const part of response.candidates[0].content.parts) {
              let imageBase64: string | undefined;

              if (part.inlineData?.data) {
                imageBase64 = part.inlineData.data;
              } else if (part.text && this.isValidBase64ImageData(part.text)) {
                imageBase64 = part.text;
              }

              if (imageBase64) {
                const filenameIndex = request.filename ? stepIndex : 0;
                const filename = FileHandler.generateFilename(
                  `${type}step${stepNumber}${request.prompt}`,
                  request.fileFormat || 'jpeg', // Stories default to jpg
                  filenameIndex,
                  request.filename,
                  forceSuffix,
                  undefined,
                  request.outputDir,
                );
                const inputBuffer = Buffer.from(imageBase64, 'base64');
                const targetFormat = this.getTargetFormatFromFilename(filename);
                const outputBuffer = this.ensureTargetImageFormat(
                  inputBuffer,
                  part.inlineData?.mimeType,
                  targetFormat,
                );
                const fullPath = await FileHandler.saveImageBuffer(
                  outputBuffer,
                  outputPath,
                  filename,
                );
                this.debug(`DEBUG - Step ${stepNumber} saved to:`, fullPath);

                // Calculate image file size and log
                const fileStats = fs.statSync(fullPath);
                const logEntry = Logger.createLogEntry(
                  'story',
                  request as unknown as Record<string, unknown>,
                  {
                    model: this.modelName,
                    prompt: stepPrompt,
                    resolution,
                    aspectRatio: request.aspectRatio,
                    hasInputImage: false,
                    generationConfig: storyGenerationConfig,
                  },
                  {
                    success: true,
                    imageSize: fileStats.size,
                    filePath: fullPath,
                  },
                );
                Logger.log(logEntry);

                return { success: true, filePath: fullPath };
              }
            }
          }

          return { success: false, error: 'No image data found in API response' };
        } catch (error: unknown) {
          const errorMessage = this.handleApiError(error);
          this.debug(
            `DEBUG - Error generating step ${stepNumber}:`,
            errorMessage,
          );

          // Log error case
          const logEntry = Logger.createLogEntry(
            'story',
            request as unknown as Record<string, unknown>,
            {
              model: this.modelName,
              prompt: stepPrompt,
              resolution,
              aspectRatio: request.aspectRatio,
              hasInputImage: false,
              generationConfig: storyGenerationConfig,
            },
            {
              success: false,
              error: errorMessage,
            },
          );
          Logger.log(logEntry);

          const authError = errorMessage
            .toLowerCase()
            .includes('authentication failed');
          return { success: false, error: errorMessage, authError };
        }
      };

      for (let i = 0; i < steps; i += parallelCount) {
        const batchIndices = Array.from(
          { length: Math.min(parallelCount, steps - i) },
          (_, batchIndex) => i + batchIndex,
        );

        const results = await Promise.all(
          batchIndices.map((stepIndex) =>
            generateStep(stepIndex, referenceImagesData),
          ),
        );

        for (let batchOffset = 0; batchOffset < results.length; batchOffset++) {
          const stepIndex = batchIndices[batchOffset];
          const result = results[batchOffset];

          if (result.success && result.filePath) {
            generatedFiles[stepIndex] = result.filePath;
            continue;
          }

          if (
            !firstError &&
            result.error &&
            result.error !== 'No image data found in API response'
          ) {
            firstError = result.error;
          }

          if (result.authError && result.error) {
            return {
              success: false,
              message: 'Story generation failed',
              error: result.error,
            };
          }
        }
      }

      const completedFiles = generatedFiles.filter(
        (file): file is string => Boolean(file),
      );

      this.debug(
        `DEBUG - Story generation completed. Generated ${completedFiles.length} out of ${steps} requested images`,
      );

      if (completedFiles.length === 0) {
        return {
          success: false,
          message: 'Failed to generate any story sequence images',
          error: firstError || 'No image data found in API responses',
        };
      }

      // Handle preview if requested
      await this.handlePreview(completedFiles, request);

      const wasFullySuccessful = completedFiles.length === steps;
      const successMessage = wasFullySuccessful
        ? `Successfully generated complete ${steps}-step ${type} sequence`
        : `Generated ${completedFiles.length} out of ${steps} requested ${type} steps (${steps - completedFiles.length} steps failed)`;

      return {
        success: true,
        message: successMessage,
        generatedFiles: completedFiles,
      };
    } catch (error: unknown) {
      this.debug('DEBUG - Error in generateStorySequence:', error);
      return {
        success: false,
        message: `Failed to generate ${request.mode} sequence`,
        error: this.handleApiError(error),
      };
    }
  }
  async editImage(
    request: ImageGenerationRequest,
  ): Promise<ImageGenerationResponse> {
    try {
      if (!request.inputImage) {
        return {
          success: false,
          message: 'Input image file is required for editing',
          error: 'Missing inputImage parameter',
        };
      }

      const fileResult = FileHandler.findInputFile(request.inputImage);
      if (!fileResult.found) {
        return {
          success: false,
          message: `Input image not found: ${request.inputImage}`,
          error: `Searched in: ${fileResult.searchedPaths.join(', ')}`,
        };
      }

      const outputPath = FileHandler.ensureOutputDirectory(request.outputDir);
      const imageBase64 = await FileHandler.readImageAsBase64(
        fileResult.filePath!,
      );

      // Determine mime type from file extension
      const ext = fileResult.filePath!.toLowerCase().split('.').pop();
      const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';

      // Use REST API for editing
      const resolution = request.resolution || ImageGenerator.DEFAULT_RESOLUTION;
      const editGenerationConfig: Record<string, unknown> = {
        responseModalities: ['Image'],
      };
      const isGemini3Edit = this.modelName.includes('gemini-3');
      if (request.aspectRatio || (isGemini3Edit && resolution)) {
        const imageConfig: Record<string, unknown> = {};
        if (request.aspectRatio) imageConfig.aspectRatio = request.aspectRatio;
        if (isGemini3Edit && resolution) imageConfig.imageSize = resolution;
        editGenerationConfig.imageConfig = imageConfig;
      }
      if (request.seed !== undefined) {
        editGenerationConfig.seed = request.seed;
      }

      let response: GeminiResponse;
      try {
        response = await this.callGeminiRestApi(
          request.prompt,
          resolution,
          request.aspectRatio,
          imageBase64,
          mimeType,
          request.seed,
        );
      } catch (error: unknown) {
        const errorMessage = this.handleApiError(error);
        this.logRetry(
          request.mode as 'edit' | 'restore',
          request as unknown as Record<string, unknown>,
          {
            model: this.modelName,
            prompt: request.prompt,
            resolution,
            aspectRatio: request.aspectRatio,
            hasInputImage: true,
            generationConfig: editGenerationConfig,
          },
          errorMessage,
        );
        response = await this.callGeminiRestApi(
          request.prompt,
          resolution,
          request.aspectRatio,
          imageBase64,
          mimeType,
          request.seed,
        );
      }

      this.debug('DEBUG - Edit API Response received');

      if (response.candidates && response.candidates[0]?.content?.parts) {
        const generatedFiles: string[] = [];
        let imageFound = false;

        for (const part of response.candidates[0].content.parts) {
          let resultImageBase64: string | undefined;

          if (part.inlineData?.data) {
            resultImageBase64 = part.inlineData.data;
            this.debug('DEBUG - Found edited image in inlineData:', {
              length: resultImageBase64.length,
              mimeType: part.inlineData.mimeType,
            });
          } else if (part.text && this.isValidBase64ImageData(part.text)) {
            resultImageBase64 = part.text;
            this.debug(
              'DEBUG - Found edited image in text field (fallback)',
            );
          }

          if (resultImageBase64) {
            const filename = FileHandler.generateFilename(
              `${request.mode}_${request.prompt}`,
              request.fileFormat || 'jpeg', // Edits default to jpg
              0,
              request.filename,
              false,
              undefined,
              request.outputDir,
            );
            const inputBuffer = Buffer.from(resultImageBase64, 'base64');
            const targetFormat = this.getTargetFormatFromFilename(filename);
            const outputBuffer = this.ensureTargetImageFormat(
              inputBuffer,
              part.inlineData?.mimeType,
              targetFormat,
            );
            const fullPath = await FileHandler.saveImageBuffer(
              outputBuffer,
              outputPath,
              filename,
            );
            generatedFiles.push(fullPath);
            this.debug('DEBUG - Edited image saved to:', fullPath);

            // Calculate image file size and log
            const fileStats = fs.statSync(fullPath);
            const logEntry = Logger.createLogEntry(
              request.mode as 'edit' | 'restore',
              request as unknown as Record<string, unknown>,
              {
                model: this.modelName,
                prompt: request.prompt,
                resolution,
                aspectRatio: request.aspectRatio,
                hasInputImage: true,
                generationConfig: editGenerationConfig,
              },
              {
                success: true,
                imageSize: fileStats.size,
                filePath: fullPath,
              },
            );
            Logger.log(logEntry);

            imageFound = true;
            break; // Only process the first valid image
          }
        }

        if (!imageFound) {
          this.debug(
            'DEBUG - No valid image data found in edit response parts',
          );
        }

        // Handle preview if requested
        await this.handlePreview(generatedFiles, request);

        return {
          success: true,
          message: `Successfully ${request.mode}d image`,
          generatedFiles,
        };
      }

      return {
        success: false,
        message: `Failed to ${request.mode} image`,
        error: 'No image data in response',
      };
    } catch (error: unknown) {
      this.debug(`DEBUG - Error in ${request.mode}Image:`, error);

      // Log error case
      const editResolution = request.resolution || ImageGenerator.DEFAULT_RESOLUTION;
      const editErrorConfig: Record<string, unknown> = {
        responseModalities: ['Image'],
      };
      const isGemini3EditErr = this.modelName.includes('gemini-3');
      if (request.aspectRatio || (isGemini3EditErr && editResolution)) {
        const imageConfig: Record<string, unknown> = {};
        if (request.aspectRatio) imageConfig.aspectRatio = request.aspectRatio;
        if (isGemini3EditErr && editResolution) imageConfig.imageSize = editResolution;
        editErrorConfig.imageConfig = imageConfig;
      }
      if (request.seed !== undefined) {
        editErrorConfig.seed = request.seed;
      }
      const logEntry = Logger.createLogEntry(
        request.mode as 'edit' | 'restore',
        request as unknown as Record<string, unknown>,
        {
          model: this.modelName,
          prompt: request.prompt,
          resolution: editResolution,
          aspectRatio: request.aspectRatio,
          hasInputImage: Boolean(request.inputImage),
          generationConfig: editErrorConfig,
        },
        {
          success: false,
          error: this.handleApiError(error),
        },
      );
      Logger.log(logEntry);

      return {
        success: false,
        message: `Failed to ${request.mode} image`,
        error: this.handleApiError(error),
      };
    }
  }
}
