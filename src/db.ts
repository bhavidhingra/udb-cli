import Database from 'better-sqlite3';
import { mkdirSync, existsSync } from 'fs';
import { dirname } from 'path';
import { config, getDbPath } from './config.js';
import { logger } from './logger.js';

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    const dbPath = getDbPath();

    // Ensure data directory exists
    const dataDir = dirname(dbPath);
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
      logger.info(`Created data directory: ${dataDir}`);
    }

    // Ensure lock directory exists
    if (!existsSync(config.KB_LOCK_DIR)) {
      mkdirSync(config.KB_LOCK_DIR, { recursive: true });
    }

    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    logger.debug(`Database initialized at: ${dbPath}`);
  }

  return db;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
    logger.debug('Database closed');
  }
}
