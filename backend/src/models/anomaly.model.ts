import { z } from 'zod';
import type { AnomalyType, Severity, SummarySource } from '../utils/constants.js';

/** Zod schema for a single inbound telemetry record. */
export const apiLogSchema = z.object({
  api_name: z.string().trim().min(1, 'api_name is required').max(200),
  response_time_ms: z.number().finite().nonnegative(),
  status_code: z.number().int().min(100).max(599),
  records_returned: z.number().int().nonnegative(),
});
export type ApiLog = z.infer<typeof apiLogSchema>;

export interface Anomaly extends ApiLog {
  id: string;
  anomaly_types: AnomalyType[];
  severity: Severity;
  ai_summary: string;
  summary_source: SummarySource;
  createdAt: string; // ISO-8601
}

export interface AlertQuery {
  api_name?: string | undefined;
  /** ISO-8601; only alerts created at or after this instant. */
  since?: string | undefined;
  limit: number;
}

export interface BatchStats {
  total_inspected: number;
  anomalies_caught: number;
  avg_response_time_ms: number;
}

/** Persistence contract; implemented by SQLite and in-memory stores. */
export interface AnomalyRepository {
  readonly kind: 'sqlite' | 'memory';
  /** Single bulk write (one transaction) for all anomalies. */
  insertMany(anomalies: Anomaly[]): Promise<void>;
  /** Newest first (createdAt DESC). */
  list(query: AlertQuery): Promise<Anomaly[]>;
  /** Delete every stored alert and reset the aggregate counters. */
  clear(): Promise<void>;
  /** Aggregate counters across every inspected record, healthy ones included. */
  recordBatch(delta: { received: number; anomalies: number; responseTimeSumMs: number }): Promise<void>;
  getStats(): Promise<BatchStats>;
  close(): void;
}
