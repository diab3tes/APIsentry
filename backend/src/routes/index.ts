import { Router } from 'express';
import type { BatchService } from '../services/batch.service.js';
import type { AnomalyRepository } from '../models/anomaly.model.js';
import { createMonitorController } from '../controllers/monitor.controller.js';
import { queryToMonitorBody, validateAlertsQuery, validateMonitorBody } from '../middlewares/validate.js';

export function createRouter(batch: BatchService, repo: AnomalyRepository): Router {
  const router = Router();
  const c = createMonitorController(batch, repo);

  router.post('/monitor', validateMonitorBody, c.monitor);
  // Browser-friendly demo: same pipeline as POST, record supplied via query string.
  router.get('/monitor/simulate', queryToMonitorBody, c.monitor);
  router.get('/alerts', validateAlertsQuery, c.alerts);
  router.delete('/alerts', c.clearAlerts);
  router.get('/stats', c.stats);
  router.get('/health', (_req, res) => {
    res.json({ status: 'ok', storage: repo.kind, uptime_s: Math.round(process.uptime()) });
  });

  return router;
}
