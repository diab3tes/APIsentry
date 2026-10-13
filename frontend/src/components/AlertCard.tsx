import type { Alert } from '../services/api'

const SEVERITY_STYLE = {
  critical: 'bg-red-500/15 text-red-300 ring-red-500/40',
  warning: 'bg-amber-500/15 text-amber-300 ring-amber-500/40',
} as const

export function AlertCard({ alert }: { alert: Alert }) {
  return (
    <article className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <header className="flex flex-wrap items-center gap-2">
        <h3 className="font-medium text-slate-100">{alert.api_name}</h3>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium uppercase ring-1 ${SEVERITY_STYLE[alert.severity]}`}>
          {alert.severity}
        </span>
        <time className="ml-auto text-xs text-slate-500" dateTime={alert.createdAt}>
          {new Date(alert.createdAt).toLocaleTimeString()}
        </time>
      </header>

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
        <span>Status <b className="text-slate-200">{alert.status_code}</b></span>
        <span>Latency <b className="text-slate-200">{Math.round(alert.response_time_ms)} ms</b></span>
        <span>Records <b className="text-slate-200">{alert.records_returned}</b></span>
        <span className="text-slate-500">{alert.anomaly_types.join(' · ')}</span>
      </div>

      <p className="mt-3 rounded-lg border-l-2 border-sky-500 bg-sky-500/10 px-3 py-2 text-sm text-sky-100">
        <span className="mr-2 text-xs font-semibold uppercase text-sky-400">
          AI Summary
        </span>
        <span className="mr-2 rounded bg-sky-500/20 px-1.5 py-0.5 text-[10px] font-medium uppercase text-sky-300">
          Source: {alert.summary_source === 'gemini' ? 'Gemini' : 'Rules (heuristic)'}
        </span>
        {alert.ai_summary}
      </p>
    </article>
  )
}
