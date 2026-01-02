/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export type ImageResolution = '1K' | '2K' | '4K';
export type AspectRatio = '1:1' | '2:3' | '3:2' | '3:4' | '4:3' | '4:5' | '5:4' | '9:16' | '16:9' | '21:9';

export interface ImageGenerationRequest {
  prompt: string;
  inputImage?: string;
  referenceImages?: string[];
  outputCount?: number;
  mode: 'generate' | 'edit' | 'restore';
  // Batch generation options
  styles?: string[];
  variations?: string[];
  format?: 'grid' | 'separate';
  fileFormat?: 'png' | 'jpeg';
  seed?: number;
  // Resolution option (only for Gemini 3 models)
  resolution?: ImageResolution;
  // Aspect ratio option
  aspectRatio?: AspectRatio;
  // Parallel generation option
  parallel?: number;
  // Preview options
  preview?: boolean;
  noPreview?: boolean;
  // Output filename override
  filename?: string;
  filenameSuffixes?: string[];
}

export interface ImageGenerationResponse {
  success: boolean;
  message: string;
  generatedFiles?: string[];
  error?: string;
}

export interface AuthConfig {
  apiKey: string;
  keyType: 'GEMINI_API_KEY' | 'GOOGLE_API_KEY';
}

export interface FileSearchResult {
  found: boolean;
  filePath?: string;
  searchedPaths: string[];
}

export interface StorySequenceArgs {
  type?: string;
  style?: string;
  transition?: string;
}

export interface IconPromptArgs {
  prompt?: string;
  type?: string;
  style?: string;
  background?: string;
  corners?: string;
}

export interface PatternPromptArgs {
  prompt?: string;
  type?: string;
  style?: string;
  density?: string;
  colors?: string;
  size?: string;
}

export interface DiagramPromptArgs {
  prompt?: string;
  type?: string;
  style?: string;
  layout?: string;
  complexity?: string;
  colors?: string;
  annotations?: string;
}
