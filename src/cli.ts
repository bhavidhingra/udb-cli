#!/usr/bin/env node

/**
 * UDB - Personal Knowledge Base with RAG
 */

// Load environment variables from ~/.udb/.env (user config) and CWD/.env (development)
import dotenv from 'dotenv';
import { homedir } from 'os';
import { join } from 'path';

// Load from user config directory first, then CWD (later values don't override)
dotenv.config({ path: join(homedir(), '.udb', '.env') });
dotenv.config(); // Falls back to CWD/.env for development

import chalk from 'chalk';
import { getDb, closeDb } from './db.js';
import { initKB, isKBOperational } from './kb/index.js';
import { startChat } from './chat.js';

async function main(): Promise<void> {
  // Handle --version and --help
  const args = process.argv.slice(2);
  if (args.includes('--version') || args.includes('-v')) {
    console.log('udb 0.1.0');
    return;
  }
  if (args.includes('--help') || args.includes('-h')) {
    console.log('Usage: udb');
    console.log('');
    console.log('Personal knowledge base with RAG-powered chat.');
    console.log('');
    console.log('Options:');
    console.log('  -v, --version  Show version');
    console.log('  -h, --help     Show this help');
    console.log('');
    console.log('In chat, you can:');
    console.log('  - Ask questions (searches KB automatically)');
    console.log('  - Add notes: "Save this: <content>"');
    console.log('  - Ingest URLs: "Add this article: <url>"');
    console.log('  - List sources: "What\'s in my KB?"');
    console.log('  - Delete: "Delete source <id>"');
    console.log('  - Read files: "Read /path/to/file and add to KB"');
    console.log('');
    console.log('Multi-line input: end line with \\ to continue');
    return;
  }

  // Initialize KB
  const db = getDb();
  await initKB(db);

  if (!isKBOperational()) {
    console.log(chalk.yellow('Warning: Ollama not available, RAG context will be limited'));
  }

  // Start chat (the only mode)
  await startChat();

  closeDb();
}

main().catch((err) => {
  console.error(chalk.red('Error:'), err);
  process.exit(1);
});
