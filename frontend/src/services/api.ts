import axios from 'axios'

const http = axios.create({ baseURL: import.meta.env.VITE_API_URL ?? '/api', timeout: 60_000 })

export type Severity = 'warning' | 'critical'

export interface ApiLog {
  api_name: string
  response_time_ms: number
  status_code: number
  records_returned: number
}

export interface Alert extends ApiLog {
  id: string
  anomaly_types: string[]
  severity: Severity
  ai_summary: string
  summary_source: 'gemini' | 'heuristic'
  createdAt: string
}

export interface MonitorResult {
  total_received: number
  healthy: number
  anomalies_detected: number
  rejected: number
  processing_time_ms: number
  alerts: Alert[]
}

export interface Stats {
  total_inspected: number
  anomalies_caught: number
  avg_response_time_ms: number
}

export const ingestBatch = (logs: ApiLog[]) => http.post<MonitorResult>('/monitor', logs).then((r) => r.data)
export const fetchAlerts = (limit = 50, since?: string) =>
  http.get<Alert[]>('/alerts', { params: { limit, since } }).then((r) => r.data)
export const clearAlerts = () => http.delete('/alerts').then(() => undefined)
export const fetchStats = () => http.get<Stats>('/stats').then((r) => r.data)

export function errorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    return (err.response?.data as { error?: string } | undefined)?.error ?? err.message
  }
  return err instanceof Error ? err.message : 'Unknown error'
}
