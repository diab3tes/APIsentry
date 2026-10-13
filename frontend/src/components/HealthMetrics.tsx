import type { Stats } from '../services/api'

function Tile({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
      <p className="text-xs uppercase tracking-wider text-slate-400">{label}</p>
      <p className={`mt-2 text-3xl font-semibold tabular-nums ${accent}`}>{value}</p>
    </div>
  )
}

export function HealthMetrics({ stats }: { stats: Stats | null }) {
  const s = stats ?? { total_inspected: 0, anomalies_caught: 0, avg_response_time_ms: 0 }
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <Tile label="Total Inspected" value={s.total_inspected.toLocaleString()} accent="text-sky-400" />
      <Tile label="Anomalies Caught" value={s.anomalies_caught.toLocaleString()} accent="text-amber-400" />
      <Tile label="Avg Response Time" value={`${s.avg_response_time_ms.toLocaleString()} ms`} accent="text-emerald-400" />
    </div>
  )
}
