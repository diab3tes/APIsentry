import { randomUUID } from 'node:crypto';
import pLimit from 'p-limit';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { apiLogSchema, type Anomaly, type AnomalyRepository, type ApiLog } from '../models/anomaly.model.js';
import { detectAll, type Detection } from './detector.js';
import { heuristicSummary, summarize, type AiSummary } from './ai.service.js';
import { notifyCritical } from './email.service.js';

export interface RejectedRecord {
  index: number;
  errors: string[];
}

export interface MonitorResult {
  total_received: number;
  healthy: number;
  anomalies_detected: number;
  rejected: number;
  processing_time_ms: number;
  alerts: Anomaly[];
  rejected_records?: RejectedRecord[];
}

export class BatchService {
  constructor(private readonly repo: AnomalyRepository) {}

  async process(payload: unknown[]): Promise<MonitorResult> {
    const started = performance.now();

    // 1. Synchronous O(N) phase: validate each record independently, then classify.
    //    One malformed record is reported but never aborts its siblings.
    const valid: ApiLog[] = [];
    const rejected: RejectedRecord[] = [];
    payload.forEach((item, index) => {
      const r = apiLogSchema.safeParse(item);
      if (r.success) valid.push(r.data);
      else rejected.push({ index, errors: r.error.issues.map((i) => `${i.path.join('.') || 'record'}: ${i.message}`) });
    });
    const { anomalies: detections, healthyCount } = detectAll(valid);

    // 2. Async I/O phase: bounded worker pool so we never exceed CONCURRENCY_LIMIT in-flight LLM calls.
    const limit = pLimit(env.CONCURRENCY_LIMIT);
    const settled = await Promise.allSettled(detections.map((d) => limit(() => summarize(d))));

    const now = Date.now();
    const alerts: Anomaly[] = detections.map((d, i) => {
      const s = settled[i]!;
      let ai: AiSummary;
      if (s.status === 'fulfilled') ai = s.value;
      else {
        // summarize() is designed not to reject; this guards against unforeseen bugs.
        logger.error({ reason: String(s.reason), api_name: d.log.api_name }, 'Summary task rejected');
        ai = { summary: heuristicSummary(d), source: 'heuristic' };
      }
      return toAnomaly(d, ai, new Date(now + i).toISOString()); // +i keeps createdAt ordering stable within a batch
    });

    // 3. Single bulk write for the whole batch (no per-record inserts).
    await this.repo.insertMany(alerts);
    await this.repo.recordBatch({
      received: valid.length,
      anomalies: alerts.length,
      responseTimeSumMs: valid.reduce((sum, l) => sum + l.response_time_ms, 0),
    });

    notifyCritical(alerts);

    const result: MonitorResult = {
      total_received: payload.length,
      healthy: healthyCount,
      anomalies_detected: alerts.length,
      rejected: rejected.length,
      processing_time_ms: Math.round(performance.now() - started),
      // Newest-first to match GET /api/alerts ordering.
      alerts: alerts.slice().reverse(),
    };
    if (rejected.length) result.rejected_records = rejected.slice(0, 50);

    logger.info(
      { received: result.total_received, anomalies: result.anomalies_detected, rejected: result.rejected, ms: result.processing_time_ms },
      'Batch processed',
    );
    return result;
  }
}

function toAnomaly(d: Detection, ai: AiSummary, createdAt: string): Anomaly {
  return {
    id: randomUUID(),
    ...d.log,
    anomaly_types: d.types,
    severity: d.severity,
    ai_summary: ai.summary,
    summary_source: ai.source,
    createdAt,
  };
}
