import { env } from '../config/env.js';
import type { ApiLog } from '../models/anomaly.model.js';
import type { AnomalyType, Severity } from '../utils/constants.js';

export interface Detection {
  log: ApiLog;
  types: AnomalyType[];
  severity: Severity;
}

/**
 * Pure, synchronous rule evaluation for one record. No I/O, so a whole batch
 * is classified in O(N) without yielding to anything slow.
 */
export function evaluate(log: ApiLog, latencyThresholdMs = env.LATENCY_THRESHOLD_MS): Detection | null {
  const types: AnomalyType[] = [];

  if (log.response_time_ms > latencyThresholdMs) types.push('HIGH_LATENCY');
  if (log.status_code >= 500) types.push('SERVER_ERROR');
  else if (log.status_code >= 400) types.push('CLIENT_ERROR');
  if (log.status_code === 200 && log.records_returned === 0) types.push('DATA_MISMATCH');

  if (types.length === 0) return null;

  const critical =
    types.includes('SERVER_ERROR') ||
    types.length > 1 ||
    log.response_time_ms > latencyThresholdMs * 2;

  return { log, types, severity: critical ? 'critical' : 'warning' };
}

export interface DetectionResult {
  anomalies: Detection[];
  healthyCount: number;
}

export function detectAll(logs: readonly ApiLog[]): DetectionResult {
  const anomalies: Detection[] = [];
  for (const log of logs) {
    const d = evaluate(log);
    if (d) anomalies.push(d);
  }
  return { anomalies, healthyCount: logs.length - anomalies.length };
}
