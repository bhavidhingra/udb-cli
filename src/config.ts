import { homedir } from 'os';
import { join } from 'path';

export const config = {
  // Data directory
  DATA_DIR: process.env.UDB_DATA_DIR || join(homedir(), '.udb'),

  // Database
  DB_FILE: 'kb.db',

  // Ollama (use 127.0.0.1 instead of localhost for IPv4/IPv6 compatibility)
  OLLAMA_URL: process.env.OLLAMA_URL || 'http://127.0.0.1:11434',
  OLLAMA_MODEL: process.env.OLLAMA_MODEL || 'nomic-embed-text',

  // Knowledge Base
  KB_CHUNK_SIZE: 800,
  KB_CHUNK_OVERLAP: 200,
  KB_MIN_CHUNK: 50, // Allow short notes
  KB_SEARCH_LIMIT: 10,
  KB_MIN_SIMILARITY: 0.7,

  // Lock directory for concurrent access
  KB_LOCK_DIR: join(process.env.UDB_DATA_DIR || join(homedir(), '.udb'), 'locks'),

  // Claude model (Bedrock inference profile)
  CLAUDE_MODEL: process.env.CLAUDE_MODEL || 'us.anthropic.claude-sonnet-4-20250514-v1:0',

  // Atlassian credentials (for Confluence/Jira REST API access)
  ATLASSIAN_EMAIL: process.env.ATLASSIAN_EMAIL || '',
};

export function getDbPath(): string {
  return join(config.DATA_DIR, config.DB_FILE);
}
