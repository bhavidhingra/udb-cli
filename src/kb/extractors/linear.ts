/**
 * Linear issue extractor using Linear GraphQL API
 */

import { logger } from '../../logger.js';
import type { ExtractedContent } from './article.js';

const LINEAR_API_URL = 'https://api.linear.app/graphql';

const ISSUE_QUERY = `
  query GetIssue($id: String!) {
    issue(id: $id) {
      identifier
      title
      description
      state { name }
      priority
      priorityLabel
      assignee { name }
      labels { nodes { name } }
      createdAt
      updatedAt
      url
      comments {
        nodes {
          body
          createdAt
          user { name }
        }
      }
    }
  }
`;

interface LinearIssue {
  identifier: string;
  title: string;
  description?: string;
  state?: { name: string };
  priority?: number;
  priorityLabel?: string;
  assignee?: { name: string };
  labels?: { nodes: { name: string }[] };
  createdAt?: string;
  updatedAt?: string;
  url?: string;
  comments?: {
    nodes: {
      body: string;
      createdAt: string;
      user?: { name: string };
    }[];
  };
}

/**
 * Parse a Linear issue URL and extract the issue identifier (e.g. "ENG-123")
 */
function parseLinearUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.endsWith('linear.app')) {
      return null;
    }
    const match = parsed.pathname.match(/\/issue\/([A-Z]+-\d+)/i);
    return match ? match[1].toUpperCase() : null;
  } catch {
    return null;
  }
}

/**
 * Format a Linear issue into a plain-text document for ingestion
 */
function formatIssue(issue: LinearIssue): string {
  const lines: string[] = [];

  lines.push(`Issue: ${issue.identifier} — ${issue.title}`);
  lines.push('');

  if (issue.state?.name) {
    lines.push(`Status: ${issue.state.name}`);
  }
  if (issue.priorityLabel) {
    lines.push(`Priority: ${issue.priorityLabel}`);
  }
  if (issue.assignee?.name) {
    lines.push(`Assignee: ${issue.assignee.name}`);
  }
  const labelNames = issue.labels?.nodes.map((l) => l.name) ?? [];
  if (labelNames.length > 0) {
    lines.push(`Labels: ${labelNames.join(', ')}`);
  }

  if (issue.description) {
    lines.push('');
    lines.push('Description:');
    lines.push(issue.description.trim());
  }

  const comments = issue.comments?.nodes ?? [];
  if (comments.length > 0) {
    lines.push('');
    lines.push(`Comments (${comments.length}):`);
    for (const comment of comments) {
      const date = comment.createdAt
        ? new Date(comment.createdAt).toISOString().slice(0, 10)
        : '';
      const author = comment.user?.name ?? 'Unknown';
      lines.push('');
      lines.push(`[${date}] ${author}:`);
      lines.push(comment.body.trim());
    }
  }

  return lines.join('\n');
}

/**
 * Check whether a URL is a Linear issue URL
 */
export function isLinearUrl(url: string): boolean {
  return parseLinearUrl(url) !== null;
}

/**
 * Extract content from a Linear issue URL
 */
export async function extractLinear(url: string): Promise<ExtractedContent | null> {
  // Read at runtime so dotenv has already loaded
  const apiKey = process.env.LINEAR_API_KEY;
  if (!apiKey) {
    logger.warn('Linear extraction requires LINEAR_API_KEY');
    return null;
  }

  const identifier = parseLinearUrl(url);
  if (!identifier) {
    logger.warn('Invalid Linear issue URL format', url);
    return null;
  }

  try {
    const res = await fetch(LINEAR_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: ISSUE_QUERY,
        variables: { id: identifier },
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) {
      const errorText = await res.text().catch(() => '');
      logger.warn('Linear API error', res.status, errorText);
      return null;
    }

    const data = await res.json() as {
      data?: { issue?: LinearIssue };
      errors?: { message: string }[];
    };

    if (data.errors?.length) {
      logger.warn('Linear GraphQL errors', data.errors.map((e) => e.message).join('; '));
      return null;
    }

    const issue = data.data?.issue;
    if (!issue) {
      logger.warn('Linear issue not found', identifier);
      return null;
    }

    const content = formatIssue(issue);
    const title = `${issue.identifier}: ${issue.title}`;

    return { title, content, url };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.warn('Linear extraction failed', url, errorMsg);
    return null;
  }
}
