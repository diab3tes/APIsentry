import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { MAX_ALERT_LIMIT, MAX_BATCH_SIZE, DEFAULT_ALERT_LIMIT } from '../utils/constants.js';

/**
 * Envelope validation only: a single object or a non-empty array of objects.
 * Individual records are validated inside BatchService so one bad record
 * can't reject (or abort) the rest of the batch.
 */
const envelope = z.union([
  z.array(z.unknown()).min(1, 'Batch must not be empty').max(MAX_BATCH_SIZE, `Batch exceeds ${MAX_BATCH_SIZE} records`),
  z.record(z.string(), z.unknown()),
]);

export function validateMonitorBody(req: Request, _res: Response, next: NextFunction): void {
  const parsed = envelope.safeParse(req.body);
  if (!parsed.success) return next(parsed.error);
  req.body = Array.isArray(parsed.data) ? parsed.data : [parsed.data];
  next();
}

const alertsQuery = z.object({
  api_name: z.string().trim().min(1).optional(),
  since: z
    .string()
    .refine((s) => !Number.isNaN(Date.parse(s)), 'since must be an ISO-8601 date')
    .transform((s) => new Date(s).toISOString())
    .optional(),
  limit: z.coerce.number().int().min(1).max(MAX_ALERT_LIMIT).default(DEFAULT_ALERT_LIMIT),
});

export function validateAlertsQuery(req: Request, res: Response, next: NextFunction): void {
  const parsed = alertsQuery.safeParse(req.query);
  if (!parsed.success) return next(parsed.error);
  res.locals.alertsQuery = parsed.data;
  next();
}

/**
 * Demo helper: lets a browser/curl GET build a single record from the query string
 * (e.g. ?api_name=x&response_time_ms=4200&status_code=500&records_returned=0) and feed it
 * to the same pipeline as POST /api/monitor. Values are coerced from strings; the record
 * itself is still validated by BatchService, so bad input yields a 400, not a crash.
 */
export function queryToMonitorBody(req: Request, _res: Response, next: NextFunction): void {
  const num = (v: unknown) => (typeof v === 'string' && v.trim() !== '' ? Number(v) : undefined);
  req.body = [
    {
      api_name: req.query.api_name,
      response_time_ms: num(req.query.response_time_ms),
      status_code: num(req.query.status_code),
      records_returned: num(req.query.records_returned),
    },
  ];
  next();
}
