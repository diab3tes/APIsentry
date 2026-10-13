export const MAX_BATCH_SIZE = 1000;
export const DEFAULT_ALERT_LIMIT = 50;
export const MAX_ALERT_LIMIT = 500;

export const AI_SYSTEM_PROMPT =
  'You are an SRE incident detection agent. Given an API failure/anomaly telemetry log, output a crisp, human-readable 1-sentence diagnostic explaining what failed and the likely operational impact.';

export type AnomalyType = 'HIGH_LATENCY' | 'SERVER_ERROR' | 'CLIENT_ERROR' | 'DATA_MISMATCH';
export type Severity = 'warning' | 'critical';
export type SummarySource = 'gemini' | 'heuristic';
