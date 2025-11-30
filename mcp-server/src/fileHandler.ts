/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { FileSearchResult } from './types.js';

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

  /**
   * Validates that a resolved path stays within allowed directories.
   * Prevents path traversal attacks by ensuring the final path is within allowed search paths.
   */
  private static isPathWithinAllowed(
    resolvedPath: string,
    allowedPaths: string[],
  ): boolean {
    const normalizedResolved = path.normalize(resolvedPath);
    return allowedPaths.some((allowedPath) => {
      const normalizedAllowed = path.normalize(allowedPath);
      return normalizedResolved.startsWith(normalizedAllowed + path.sep);
    });
  }

  /**
   * Sanitizes a filename by removing path traversal characters.
   * Only allows alphanumeric characters, underscores, hyphens, dots, and spaces.
   */
  private static sanitizeFilename(filename: string): string {
    // Get only the basename to prevent any directory traversal
    const basename = path.basename(filename);
    // Additional sanitization: remove any remaining potentially dangerous characters
    return basename.replace(/[^a-zA-Z0-9._\- ]/g, '_');
  }

  static ensureOutputDirectory(): string {
    const outputPath = path.join(process.cwd(), this.OUTPUT_DIR);

    if (!fs.existsSync(outputPath)) {
      fs.mkdirSync(outputPath, { recursive: true });
    }

    return outputPath;
  }

  static findInputFile(filename: string): FileSearchResult {
    // Sanitize the filename to prevent path traversal
    const sanitizedFilename = this.sanitizeFilename(filename);

    // For absolute paths, verify the file exists and is within allowed directories
    if (path.isAbsolute(filename)) {
      const resolvedPath = path.resolve(filename);
      // Check if the absolute path is within one of the allowed search paths
      if (
        this.isPathWithinAllowed(resolvedPath, this.SEARCH_PATHS) &&
        fs.existsSync(resolvedPath)
      ) {
        return {
          found: true,
          filePath: resolvedPath,
          searchedPaths: [],
        };
      }
      // If absolute path is not within allowed paths, fall through to search
    }

    const searchPaths = this.SEARCH_PATHS;

    for (const searchPath of searchPaths) {
      const fullPath = path.resolve(path.join(searchPath, sanitizedFilename));
      // Verify the resolved path stays within the search path (defense in depth)
      if (
        fullPath.startsWith(path.resolve(searchPath)) &&
        fs.existsSync(fullPath)
      ) {
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
  ): string {
    // Create user-friendly filename from prompt
    let baseName = prompt
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '') // Remove special characters
      .replace(/\s+/g, '_') // Replace spaces with underscores
      .substring(0, 32); // Limit to 32 characters

    if (!baseName) {
      baseName = 'generated_image';
    }

    const extension = format === 'jpeg' ? 'jpg' : 'png';

    // Check for existing files and add counter if needed
    const outputPath = this.ensureOutputDirectory();
    let fileName = `${baseName}.${extension}`;
    let counter = index > 0 ? index : 1;

    while (fs.existsSync(path.join(outputPath, fileName))) {
      fileName = `${baseName}_${counter}.${extension}`;
      counter++;
    }

    return fileName;
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

  static async readImageAsBase64(filePath: string): Promise<string> {
    const buffer = await fs.promises.readFile(filePath);
    return buffer.toString('base64');
  }
}
