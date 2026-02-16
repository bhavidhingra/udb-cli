/**
 * Google Docs extractor using OAuth 2.0 for authentication
 */

import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import { logger } from '../../logger.js';
import type { ExtractedContent } from './article.js';

const SCOPES = ['https://www.googleapis.com/auth/documents.readonly'];
const TOKEN_PATH = path.join(process.env.HOME || '', '.udb', 'google-tokens.json');
const CREDENTIALS_PATH = path.join(process.env.HOME || '', '.udb', 'credentials.json');

interface StoredTokens {
  access_token: string;
  refresh_token: string;
  expiry_date: number;
}

interface Credentials {
  installed?: {
    client_id: string;
    client_secret: string;
    redirect_uris: string[];
  };
  web?: {
    client_id: string;
    client_secret: string;
    redirect_uris: string[];
  };
}

/**
 * Parse Google Docs URL to extract document ID
 * Supports: https://docs.google.com/document/d/DOC_ID/...
 */
function parseGoogleDocsUrl(url: string): string | null {
  const match = url.match(/docs\.google\.com\/document\/d\/([a-zA-Z0-9-_]+)/);
  return match?.[1] || null;
}

/**
 * Load credentials from file
 */
function loadCredentials(): Credentials | null {
  try {
    if (!fs.existsSync(CREDENTIALS_PATH)) {
      logger.warn('Google credentials not found at', CREDENTIALS_PATH);
      return null;
    }
    const content = fs.readFileSync(CREDENTIALS_PATH, 'utf-8');
    return JSON.parse(content);
  } catch (err) {
    logger.warn('Failed to load Google credentials', err);
    return null;
  }
}

/**
 * Load stored tokens from file
 */
function loadTokens(): StoredTokens | null {
  try {
    if (!fs.existsSync(TOKEN_PATH)) {
      return null;
    }
    const content = fs.readFileSync(TOKEN_PATH, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * Save tokens to file
 */
function saveTokens(tokens: StoredTokens): void {
  try {
    const dir = path.dirname(TOKEN_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
  } catch (err) {
    logger.warn('Failed to save tokens', err);
  }
}

/**
 * Create OAuth2 client from credentials
 */
function createOAuth2Client(credentials: Credentials): OAuth2Client | null {
  const creds = credentials.installed || credentials.web;
  if (!creds) {
    logger.warn('Invalid credentials format');
    return null;
  }

  return new google.auth.OAuth2(
    creds.client_id,
    creds.client_secret,
    'http://localhost:3000/oauth2callback'
  );
}

/**
 * Start local server to receive OAuth callback
 */
function startCallbackServer(oauth2Client: OAuth2Client): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        const url = new URL(req.url || '', 'http://localhost:3000');
        if (url.pathname === '/oauth2callback') {
          const code = url.searchParams.get('code');
          if (code) {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end('<html><body><h1>Authorization successful!</h1><p>You can close this window and return to the terminal.</p></body></html>');
            server.close();
            resolve(code);
          } else {
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end('<html><body><h1>Authorization failed</h1><p>No code received.</p></body></html>');
            server.close();
            reject(new Error('No authorization code received'));
          }
        }
      } catch (err) {
        server.close();
        reject(err);
      }
    });

    server.listen(3000, () => {
      logger.info('OAuth callback server listening on http://localhost:3000');
    });

    // Timeout after 2 minutes
    setTimeout(() => {
      server.close();
      reject(new Error('OAuth authorization timed out'));
    }, 120000);
  });
}

/**
 * Get authenticated OAuth2 client
 * Will prompt for authorization if no valid tokens exist
 */
async function getAuthenticatedClient(): Promise<OAuth2Client | null> {
  const credentials = loadCredentials();
  if (!credentials) {
    return null;
  }

  const oauth2Client = createOAuth2Client(credentials);
  if (!oauth2Client) {
    return null;
  }

  // Check for existing tokens
  const tokens = loadTokens();
  if (tokens) {
    oauth2Client.setCredentials({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry_date: tokens.expiry_date,
    });

    // Check if token needs refresh
    if (tokens.expiry_date && tokens.expiry_date < Date.now()) {
      try {
        const { credentials: newCreds } = await oauth2Client.refreshAccessToken();
        const newTokens: StoredTokens = {
          access_token: newCreds.access_token || '',
          refresh_token: newCreds.refresh_token || tokens.refresh_token,
          expiry_date: newCreds.expiry_date || 0,
        };
        saveTokens(newTokens);
        oauth2Client.setCredentials(newCreds);
        logger.info('Google OAuth token refreshed');
      } catch (err) {
        logger.warn('Token refresh failed, need to re-authorize', err);
        // Fall through to authorization flow
      }
    } else {
      return oauth2Client;
    }
  }

  // Need to authorize - generate auth URL and wait for callback
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent', // Force consent to get refresh token
  });

  console.log('\n🔐 Google Docs authorization required.');
  console.log('Opening browser for authorization...\n');
  console.log('If browser does not open, visit this URL:\n');
  console.log(authUrl);
  console.log('');

  // Try to open browser
  const { exec } = await import('child_process');
  exec(`open "${authUrl}"`);

  try {
    // Wait for OAuth callback
    const code = await startCallbackServer(oauth2Client);

    // Exchange code for tokens
    const { tokens: newTokens } = await oauth2Client.getToken(code);

    const storedTokens: StoredTokens = {
      access_token: newTokens.access_token || '',
      refresh_token: newTokens.refresh_token || '',
      expiry_date: newTokens.expiry_date || 0,
    };

    saveTokens(storedTokens);
    oauth2Client.setCredentials(newTokens);

    console.log('\n✅ Google authorization successful! Tokens saved.\n');
    return oauth2Client;
  } catch (err) {
    logger.error('OAuth authorization failed', err);
    return null;
  }
}

interface DocElement {
  textRun?: {
    content?: string | null;
    textStyle?: {
      link?: {
        url?: string | null;
      } | null;
    } | null;
  } | null;
}

interface DocParagraph {
  paragraph?: {
    elements?: DocElement[] | null;
  } | null;
}

interface DocBody {
  title?: string | null;
  body?: {
    content?: DocParagraph[] | null;
  } | null;
}

/**
 * Extract text content from Google Docs API response
 * Includes hyperlinks inline as markdown-style links
 */
function extractTextFromDocument(doc: DocBody): { title: string; content: string } {
  const title = doc.title || 'Untitled';
  let content = '';
  const links: { text: string; url: string }[] = [];

  for (const item of doc.body?.content || []) {
    if (item.paragraph) {
      for (const el of item.paragraph.elements || []) {
        if (el.textRun?.content) {
          const text = el.textRun.content;
          const linkUrl = el.textRun.textStyle?.link?.url;

          if (linkUrl) {
            // Include link inline as markdown format
            const linkText = text.trim();
            content += `[${linkText}](${linkUrl})`;
            // Also collect links for a summary at the end
            if (linkText && !links.some(l => l.url === linkUrl)) {
              links.push({ text: linkText, url: linkUrl });
            }
            // Preserve trailing whitespace/newlines
            const trailing = text.match(/\s+$/);
            if (trailing) content += trailing[0];
          } else {
            content += text;
          }
        }
      }
    }
  }

  // Append links section at the end for better searchability
  if (links.length > 0) {
    content += '\n\n---\nLinks:\n';
    for (const link of links) {
      content += `- ${link.text}: ${link.url}\n`;
    }
  }

  return { title, content: content.trim() };
}

/**
 * Extract content from a Google Docs URL
 */
export async function extractGoogleDocs(url: string): Promise<ExtractedContent | null> {
  const docId = parseGoogleDocsUrl(url);
  if (!docId) {
    logger.warn('Invalid Google Docs URL', url);
    return null;
  }

  const auth = await getAuthenticatedClient();
  if (!auth) {
    logger.warn('Failed to authenticate with Google');
    return null;
  }

  try {
    const docs = google.docs({ version: 'v1', auth });
    const response = await docs.documents.get({ documentId: docId });

    const { title, content } = extractTextFromDocument(response.data);

    if (content.length < 10) {
      logger.warn('Google Docs content too short', url);
      return null;
    }

    return {
      title,
      content,
      url,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.warn('Google Docs extraction failed', url, errorMsg);
    return null;
  }
}

/**
 * Check if URL is a Google Docs URL
 */
export function isGoogleDocsUrl(url: string): boolean {
  return /docs\.google\.com\/document\/d\/[a-zA-Z0-9-_]+/.test(url);
}
