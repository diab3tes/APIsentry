import type { NextFunction, Request, Response } from 'express';
import type { BatchService } from '../services/batch.service.js';
import type { AlertQuery, AnomalyRepository } from '../models/anomaly.model.js';
import { HttpError } from '../middlewares/error-handler.js';

export function createMonitorController(batch: BatchService, repo: AnomalyRepository) {
  return {
    async monitor(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const result = await batch.process(req.body as unknown[]);
        if (result.rejected === result.total_received) {
          throw new HttpError(400, 'No valid records in payload', result.rejected_records);
        }
        res.status(200).json(result);
      } catch (err) {
        next(err);
      }
    },

    async alerts(_req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const query = res.locals.alertsQuery as AlertQuery;
        res.json(await repo.list(query));
      } catch (err) {
        next(err);
      }
    },

    async clearAlerts(_req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        await repo.clear();
        res.status(204).end();
      } catch (err) {
        next(err);
      }
    },

    async stats(_req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        res.json(await repo.getStats());
      } catch (err) {
        next(err);
      }
    },
  };
}
