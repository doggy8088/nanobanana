/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs';
import * as path from 'path';
import { GeneratedImageInfo, ImageResolution, AspectRatio } from './types.js';

export interface UploadResult {
  url: string;
  fileSize: number;
}

/**
 * Azure Blob Storage uploader using SAS Token URL
 */
export class BlobUploader {
  private containerSasUrl: string | null;

  constructor() {
    // Get the Blob Container URL with SAS Token from environment variable
    this.containerSasUrl = process.env.NANOBANANA_AZURE_BLOB_SAS_URL || null;

    if (this.containerSasUrl) {
      console.error('✓ Found NANOBANANA_AZURE_BLOB_SAS_URL environment variable');
    } else {
      console.error('⚠ NANOBANANA_AZURE_BLOB_SAS_URL not set - images will only be saved locally');
    }
  }

  /**
   * Check if Azure Blob Storage is configured
   */
  isConfigured(): boolean {
    return this.containerSasUrl !== null;
  }

  /**
   * Upload a file to Azure Blob Storage
   * @param filePath - Local file path to upload
   * @returns Upload result with URL and file size, or null if upload failed
   */
  async uploadFile(filePath: string): Promise<UploadResult | null> {
    if (!this.containerSasUrl) {
      console.error('DEBUG - Azure Blob Storage not configured, skipping upload');
      return null;
    }

    try {
      const fileName = path.basename(filePath);
      const fileContent = fs.readFileSync(filePath);
      const fileSize = fileContent.length;

      // Determine content type based on file extension
      const ext = path.extname(filePath).toLowerCase();
      const contentType = ext === '.png' ? 'image/png' : 'image/jpeg';

      // Parse the SAS URL to construct the blob URL
      // Expected format: https://<storage-account>.blob.core.windows.net/<container>?<sas-token>
      const url = new URL(this.containerSasUrl);
      const sasToken = url.search; // includes the '?'
      const containerBaseUrl = `${url.origin}${url.pathname}`;

      // Create unique blob name with timestamp to avoid conflicts
      const timestamp = Date.now();
      const uniqueFileName = `${timestamp}-${fileName}`;
      const blobUrl = `${containerBaseUrl}/${uniqueFileName}${sasToken}`;

      console.error(`DEBUG - Uploading to Azure Blob Storage: ${uniqueFileName}`);

      // Upload using PUT request with x-ms-blob-type header
      const response = await fetch(blobUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': contentType,
          'x-ms-blob-type': 'BlockBlob',
          'Content-Length': fileSize.toString(),
        },
        body: fileContent,
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`DEBUG - Azure Blob upload failed: ${response.status} ${response.statusText}`);
        console.error(`DEBUG - Error details: ${errorText}`);
        return null;
      }

      // Return the public URL (without SAS token for cleaner URL, assuming container allows public read)
      // If the container is private, the SAS token URL should be returned instead
      const publicUrl = `${containerBaseUrl}/${uniqueFileName}`;
      console.error(`DEBUG - Successfully uploaded to: ${publicUrl}`);

      return { url: publicUrl, fileSize };
    } catch (error: unknown) {
      console.error(
        'DEBUG - Error uploading to Azure Blob Storage:',
        error instanceof Error ? error.message : String(error),
      );
      return null;
    }
  }

  /**
   * Get file size of a local file
   */
  getFileSize(filePath: string): number {
    try {
      const stats = fs.statSync(filePath);
      return stats.size;
    } catch {
      return 0;
    }
  }

  /**
   * Build GeneratedImageInfo for files with optional upload
   * @param filePaths - Array of local file paths
   * @param options - Generation options (resolution, aspectRatio, seed, format)
   * @returns Array of GeneratedImageInfo objects
   */
  async buildImageInfos(
    filePaths: string[],
    options: {
      resolution?: ImageResolution;
      aspectRatio?: AspectRatio;
      seed?: number;
      format?: 'png' | 'jpeg';
    }
  ): Promise<GeneratedImageInfo[]> {
    const imageInfos: GeneratedImageInfo[] = [];

    for (const filePath of filePaths) {
      const ext = path.extname(filePath).toLowerCase();
      const format = ext === '.png' ? 'png' : 'jpeg';
      const fileSize = this.getFileSize(filePath);

      const info: GeneratedImageInfo = {
        localPath: filePath,
        fileSize,
        format: options.format || format,
        resolution: options.resolution,
        aspectRatio: options.aspectRatio,
        seed: options.seed,
      };

      // Upload to Azure Blob Storage if configured
      const uploadResult = await this.uploadFile(filePath);
      if (uploadResult) {
        info.url = uploadResult.url;
      }

      imageInfos.push(info);
    }

    return imageInfos;
  }
}
