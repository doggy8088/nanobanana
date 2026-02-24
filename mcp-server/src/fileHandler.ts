/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs';
import * as path from 'path';
import { FileSearchResult } from './types.js';

export class FileHandler {
  private static readonly OUTPUT_DIR = 'nanobanana-output';
  private static readonly SEARCH_PATHS = [
    process.cwd(),
    path.join(process.cwd(), 'images'),
    path.join(process.cwd(), 'input'),
    path.join(process.cwd(), this.OUTPUT_DIR),
    path.join(process.env.HOME || '~', 'Downloads'),
    path.join(process.env.HOME || '~', 'Desktop'),
  ];

  static ensureOutputDirectory(customDir?: string): string {
    const outputPath = customDir
      ? path.resolve(customDir)
      : path.join(process.cwd(), this.OUTPUT_DIR);

    if (!fs.existsSync(outputPath)) {
      fs.mkdirSync(outputPath, { recursive: true });
    }

    return outputPath;
  }

  static findInputFile(filename: string): FileSearchResult {
    if (path.isAbsolute(filename) && fs.existsSync(filename)) {
      return {
        found: true,
        filePath: filename,
        searchedPaths: [],
      };
    }

    const searchPaths = this.SEARCH_PATHS;

    for (const searchPath of searchPaths) {
      const fullPath = path.join(searchPath, filename);
      if (fs.existsSync(fullPath)) {
        return {
          found: true,
          filePath: fullPath,
          searchedPaths: searchPaths,
        };
      }
    }

    return {
      found: false,
      searchedPaths: searchPaths,
    };
  }

  static generateFilename(
    prompt: string,
    format: 'png' | 'jpeg' = 'jpeg',
    index: number = 0,
    customFilename?: string,
    forceSuffix: boolean = false,
    suffixOverride?: string | number,
    outputDir?: string,
  ): string {
    if (!customFilename) {
      const baseName = this.derivePromptBaseName(prompt);
      const extension = format === 'jpeg' ? 'jpg' : 'png';
      const outputPath = this.ensureOutputDirectory(outputDir);
      let fileName = `${baseName}.${extension}`;
      let counter = index > 0 ? index : 1;

      while (fs.existsSync(path.join(outputPath, fileName))) {
        fileName = `${baseName}_${counter}.${extension}`;
        counter++;
      }

      return fileName;
    }

    const outputPath = this.ensureOutputDirectory(outputDir);
    const { baseName, extension } = this.parseCustomFilename(
      customFilename,
      format,
    );

    const normalizedSuffix =
      suffixOverride !== undefined && suffixOverride !== null
        ? this.sanitizeBaseName(String(suffixOverride))
        : '';

    if (normalizedSuffix) {
      let fileName = `${baseName}_${normalizedSuffix}.${extension}`;
      let collisionCounter = 1;

      while (fs.existsSync(path.join(outputPath, fileName))) {
        fileName = `${baseName}_${normalizedSuffix}_${collisionCounter}.${extension}`;
        collisionCounter++;
      }

      return fileName;
    }

    const useSuffix = forceSuffix || index > 0;
    let counter = useSuffix ? (forceSuffix ? index + 1 : index) : 0;

    const buildFileName = (suffixCounter: number) =>
      suffixCounter > 0
        ? `${baseName}_${suffixCounter}.${extension}`
        : `${baseName}.${extension}`;

    let fileName = buildFileName(useSuffix ? counter : 0);

    while (fs.existsSync(path.join(outputPath, fileName))) {
      if (useSuffix) {
        counter += 1;
      } else {
        counter = counter === 0 ? 1 : counter + 1;
      }
      fileName = buildFileName(counter);
    }

    return fileName;
  }

  private static derivePromptBaseName(prompt: string): string {
    let baseName = prompt
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '') // Remove special characters
      .replace(/\s+/g, '_') // Replace spaces with underscores
      .substring(0, 32); // Limit to 32 characters

    if (!baseName) {
      baseName = 'generated_image';
    }

    return baseName;
  }

  private static sanitizeBaseName(value: string): string {
    return value
      .trim()
      .replace(/\s+/g, '_')
      .replace(/[^A-Za-z0-9_-]/g, '');
  }

  private static parseCustomFilename(
    filename: string,
    format: 'png' | 'jpeg',
  ): { baseName: string; extension: 'jpg' | 'png' } {
    const trimmed = filename.trim();
    const basename = path.basename(trimmed);
    const parsed = path.parse(basename);
    const rawBase = parsed.name || parsed.base;
    let baseName = this.sanitizeBaseName(rawBase);

    if (!baseName) {
      baseName = 'generated_image';
    }

    const rawExt = parsed.ext.replace('.', '').toLowerCase();
    let extension: 'jpg' | 'png' = format === 'jpeg' ? 'jpg' : 'png';

    if (rawExt === 'jpg' || rawExt === 'jpeg') {
      extension = 'jpg';
    } else if (rawExt === 'png') {
      extension = 'png';
    }

    return { baseName, extension };
  }

  static async saveImageFromBase64(
    base64Data: string,
    outputPath: string,
    filename: string,
  ): Promise<string> {
    const buffer = Buffer.from(base64Data, 'base64');
    const fullPath = path.join(outputPath, filename);

    await fs.promises.writeFile(fullPath, buffer);
    return fullPath;
  }

  static async saveImageBuffer(
    buffer: Buffer,
    outputPath: string,
    filename: string,
  ): Promise<string> {
    const fullPath = path.join(outputPath, filename);
    await fs.promises.writeFile(fullPath, buffer);
    return fullPath;
  }

  static async readImageAsBase64(filePath: string): Promise<string> {
    const buffer = await fs.promises.readFile(filePath);
    return buffer.toString('base64');
  }
}
