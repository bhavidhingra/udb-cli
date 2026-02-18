/**
 * Local file extraction for knowledge base ingestion
 */

import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { resolve, basename, extname } from 'path';
import { logger } from '../../logger.js';
import type { ExtractedContent } from './article.js';

/**
 * Check if input looks like a local file path (vs URL)
 */
export function isFilePath(input: string): boolean {
  return (
    input.startsWith('/') ||
    input.startsWith('~/') ||
    input.startsWith('./') ||
    input.startsWith('../') ||
    /^[a-zA-Z]:\\/.test(input) // Windows drive letter
  );
}

/**
 * Resolve file path, handling ~ for home directory
 */
export function resolvePath(filePath: string): string {
  if (filePath.startsWith('~/')) {
    return resolve(process.env.HOME || '', filePath.slice(2));
  }
  return resolve(filePath);
}

/**
 * Extract title from markdown content (first # heading)
 */
function extractMarkdownTitle(content: string): string | null {
  const match = content.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : null;
}

/**
 * Extract content from a local file
 */
export async function extractFile(
  filePath: string,
): Promise<ExtractedContent | null> {
  try {
    // Resolve path (handle ~, ., ..)
    const resolvedPath = resolvePath(filePath);

    // Check file exists
    if (!existsSync(resolvedPath)) {
      logger.error('File not found', resolvedPath);
      return null;
    }

    // Read file content
    const content = await readFile(resolvedPath, 'utf-8');

    if (!content || content.trim().length === 0) {
      logger.error('File is empty', resolvedPath);
      return null;
    }

    // Extract title based on file type
    const ext = extname(resolvedPath).toLowerCase();
    let title = basename(resolvedPath);

    // For markdown files, try to extract title from first heading
    if (ext === '.md' || ext === '.markdown') {
      const mdTitle = extractMarkdownTitle(content);
      if (mdTitle) {
        title = mdTitle;
      }
    }

    return {
      title,
      content: content.trim(),
      url: resolvedPath, // Store resolved absolute path
    };
  } catch (err) {
    logger.error('File extraction failed', filePath, err);
    return null;
  }
}
