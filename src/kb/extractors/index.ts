/**
 * Content extractors for different source types
 */

export { extractArticle } from './article.js';
export { extractTweet } from './tweet.js';
export { extractVideoTranscript, extractVideoId } from './video.js';
export { extractConfluence } from './confluence.js';
export { extractGoogleDocs, isGoogleDocsUrl } from './google-docs.js';

export type { ExtractedContent } from './article.js';

/**
 * Map of extractors by source type
 */
import type { SourceType } from '../types.js';
import type { ExtractedContent } from './article.js';
import { extractArticle } from './article.js';
import { extractTweet } from './tweet.js';
import { extractVideoTranscript } from './video.js';
import { extractConfluence } from './confluence.js';
import { extractGoogleDocs } from './google-docs.js';

const EXTRACTORS: Record<
  SourceType,
  (url: string) => Promise<ExtractedContent | null>
> = {
  article: extractArticle,
  video: extractVideoTranscript, // YouTube transcript via yt-dlp
  pdf: async () => null, // PDF not implemented
  text: async () => null, // Direct content, no extraction needed
  tweet: extractTweet,
  confluence: extractConfluence, // Atlassian Confluence via REST API
  google_docs: extractGoogleDocs, // Google Docs via OAuth API
  other: extractArticle,
};

/**
 * Extract content from a URL based on source type
 */
export async function extractContent(
  url: string,
  type: SourceType,
): Promise<ExtractedContent | null> {
  const extractor = EXTRACTORS[type] || EXTRACTORS.article;
  return extractor(url);
}
