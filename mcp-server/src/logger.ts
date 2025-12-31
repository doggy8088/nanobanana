/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

export interface ImageGenerationLogEntry {
  timestamp: string;
  type: 'generate' | 'edit' | 'restore' | 'story';
  input: {
    request: Record<string, unknown>;
  };
  apiCall: {
    model: string;
    prompt: string;
    resolution?: string;
    aspectRatio?: string;
    hasInputImage: boolean;
    generationConfig: Record<string, unknown>;
  };
  result: {
    success: boolean;
    imageSize?: number;
    filePath?: string;
    error?: string;
  };
}

export class Logger {
  private static logsDir: string | null = null;

  /**
   * Get the logs directory path (mcp-server/logs/)
   */
  private static getLogsDirectory(): string {
    if (this.logsDir) {
      return this.logsDir;
    }

    // Get the directory where this module is located
    const currentFileUrl = import.meta.url;
    const currentFilePath = fileURLToPath(currentFileUrl);
    const srcDir = path.dirname(currentFilePath);
    const mcpServerDir = path.dirname(srcDir);
    
    this.logsDir = path.join(mcpServerDir, 'logs');
    return this.logsDir;
  }

  /**
   * Ensure the logs directory exists
   */
  private static ensureLogsDirectory(): string {
    const logsDir = this.getLogsDirectory();
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
      console.error(`DEBUG - Created logs directory: ${logsDir}`);
    }
    return logsDir;
  }

  /**
   * Get today's log file path
   */
  private static getLogFilePath(): string {
    const logsDir = this.ensureLogsDirectory();
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
    return path.join(logsDir, `${today}.jsonl`);
  }

  /**
   * Write a log entry to the log file
   */
  static log(entry: ImageGenerationLogEntry): void {
    try {
      const logFilePath = this.getLogFilePath();
      const logLine = JSON.stringify(entry) + '\n';
      
      fs.appendFileSync(logFilePath, logLine, 'utf8');
      console.error(`DEBUG - Log written to: ${logFilePath}`);
    } catch (error) {
      console.error('DEBUG - Failed to write log:', error instanceof Error ? error.message : String(error));
    }
  }

  /**
   * Create a log entry for image generation
   */
  static createLogEntry(
    type: ImageGenerationLogEntry['type'],
    request: Record<string, unknown>,
    apiCallInfo: {
      model: string;
      prompt: string;
      resolution?: string;
      aspectRatio?: string;
      hasInputImage: boolean;
      generationConfig: Record<string, unknown>;
    },
    result: {
      success: boolean;
      imageSize?: number;
      filePath?: string;
      error?: string;
    },
  ): ImageGenerationLogEntry {
    return {
      timestamp: new Date().toISOString(),
      type,
      input: {
        request: this.sanitizeRequest(request),
      },
      apiCall: apiCallInfo,
      result,
    };
  }

  /**
   * Sanitize request object to remove sensitive data and handle special values
   */
  private static sanitizeRequest(request: Record<string, unknown>): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};
    
    for (const [key, value] of Object.entries(request)) {
      // Skip large base64 data, just record that it exists
      if (key === 'inputImage' && typeof value === 'string' && value.length > 1000) {
        sanitized[key] = `[BASE64_DATA: ${value.length} chars]`;
      } else {
        sanitized[key] = value;
      }
    }
    
    return sanitized;
  }
}
