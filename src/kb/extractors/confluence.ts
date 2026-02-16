/**
 * Confluence page extractor using Atlassian REST API
 */

import { JSDOM } from 'jsdom';
import { logger } from '../../logger.js';
import type { ExtractedContent } from './article.js';

/**
 * Parse Confluence URL to extract domain and page ID
 * Supports formats:
 * - https://domain.atlassian.net/wiki/spaces/SPACE/pages/PAGE_ID/Title
 * - https://domain.atlassian.net/wiki/x/SHORT_LINK
 */
function parseConfluenceUrl(url: string): { domain: string; pageId: string } | null {
  try {
    const parsed = new URL(url);

    // Check if it's an Atlassian domain
    if (!parsed.hostname.endsWith('.atlassian.net')) {
      return null;
    }

    // Extract page ID from URL path
    // Format: /wiki/spaces/SPACE/pages/PAGE_ID/...
    const pagesMatch = parsed.pathname.match(/\/wiki\/spaces\/[^/]+\/pages\/(\d+)/);
    if (pagesMatch) {
      return {
        domain: parsed.hostname,
        pageId: pagesMatch[1],
      };
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Convert Confluence storage format HTML to plain text
 */
function htmlToText(html: string): string {
  const dom = new JSDOM(`<body>${html}</body>`);
  const doc = dom.window.document;

  // Replace list items with bullet points
  doc.querySelectorAll('li').forEach((li) => {
    li.textContent = `• ${li.textContent?.trim()}`;
  });

  // Add newlines for block elements
  doc.querySelectorAll('p, div, li, h1, h2, h3, h4, h5, h6').forEach((el) => {
    el.textContent = `${el.textContent}\n`;
  });

  // Get text content and clean up whitespace
  const text = doc.body?.textContent || '';
  return text
    .replace(/\n{3,}/g, '\n\n')  // Remove excessive newlines
    .trim();
}

/**
 * Extract content from a Confluence page
 */
export async function extractConfluence(url: string): Promise<ExtractedContent | null> {
  // Read directly from process.env at runtime (config values are cached at import time, before dotenv runs)
  const email = process.env.ATLASSIAN_EMAIL;
  const token = process.env.ATLASSIAN_API_TOKEN;

  if (!email || !token) {
    logger.warn('Confluence extraction requires ATLASSIAN_EMAIL and ATLASSIAN_API_TOKEN');
    return null;
  }

  const parsed = parseConfluenceUrl(url);
  if (!parsed) {
    logger.warn('Invalid Confluence URL format', url);
    return null;
  }

  try {
    const apiUrl = `https://${parsed.domain}/wiki/api/v2/pages/${parsed.pageId}?body-format=storage`;
    const auth = Buffer.from(`${email}:${token}`).toString('base64');

    const res = await fetch(apiUrl, {
      headers: {
        'Authorization': `Basic ${auth}`,
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) {
      const errorText = await res.text().catch(() => '');
      logger.warn('Confluence API error', res.status, errorText);
      return null;
    }

    const data = await res.json() as {
      title?: string;
      body?: { storage?: { value?: string } };
    };

    const title = data.title || 'Untitled';
    const htmlContent = data.body?.storage?.value || '';

    if (!htmlContent) {
      logger.warn('Confluence page has no content', url);
      return null;
    }

    const content = htmlToText(htmlContent);

    if (content.length < 10) {
      logger.warn('Confluence page content too short', url);
      return null;
    }

    return {
      title,
      content,
      url,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.warn('Confluence extraction failed', url, errorMsg);
    return null;
  }
}
