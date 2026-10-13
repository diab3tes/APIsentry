import cors from 'cors';
import express, { type Express } from 'express';
import { pinoHttp } from 'pino-http';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import type { AnomalyRepository } from './models/anomaly.model.js';
import { BatchService } from './services/batch.service.js';
import { createRouter } from './routes/index.js';
import { errorHandler, notFound } from './middlewares/error-handler.js';

export function createApp(repo: AnomalyRepository): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors({ origin: env.CORS_ORIGIN.split(',').map((s) => s.trim()) }));
  app.use(express.json({ limit: '2mb' }));
  app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === '/api/health' } }));

  app.use('/api', createRouter(new BatchService(repo), repo));
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
