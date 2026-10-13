import fs from 'node:fs';
import path from 'node:path';
import { env } from './env.js';
import { logger } from '../utils/logger.js';
import type { AnomalyRepository } from '../models/anomaly.model.js';
import { MemoryAnomalyRepository } from '../models/memory.repository.js';
import { SqliteAnomalyRepository } from '../models/sqlite.repository.js';

/**
 * Resolve DATABASE_URL to a repository.
 * - unset/empty            -> in-memory store
 * - file:./x.db / x.db     -> SQLite
 * - mongodb:// (unsupported) or SQLite open failure -> in-memory store, with a warning
 */
export function createRepository(): AnomalyRepository {
  const url = env.DATABASE_URL;
  if (!url) {
    logger.warn('DATABASE_URL not set; using in-memory store (data is lost on restart)');
    return new MemoryAnomalyRepository();
  }
  if (/^mongodb(\+srv)?:\/\//i.test(url)) {
    logger.warn('MongoDB URLs are not supported by this build; falling back to in-memory store');
    return new MemoryAnomalyRepository();
  }

  try {
    const raw = url.replace(/^(sqlite:|file:)(\/\/)?/i, '');
    const filePath = raw === ':memory:' ? raw : path.resolve(raw);
    if (filePath !== ':memory:') fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const repo = new SqliteAnomalyRepository(filePath);
    logger.info({ filePath }, 'SQLite database ready');
    return repo;
  } catch (err) {
    logger.error({ err }, 'SQLite initialisation failed; falling back to in-memory store');
    return new MemoryAnomalyRepository();
  }
}
