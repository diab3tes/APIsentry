import { useCallback, useEffect, useState } from 'react'
import { AlertCard } from './components/AlertCard'
import { HealthMetrics } from './components/HealthMetrics'
import { SimulationPanel } from './components/SimulationPanel'
import { clearAlerts, errorMessage, fetchAlerts, fetchStats, type Alert, type Stats } from './services/api'

const POLL_MS = 5000

const RANGES = [
  { key: 'all', label: 'All', ms: null },
  { key: '5m', label: 'Latest (5 min)', ms: 5 * 60_000 },
  { key: '1h', label: 'Last 1h', ms: 60 * 60_000 },
  { key: '1d', label: 'Last day', ms: 24 * 60 * 60_000 },
  { key: '1w', label: 'Last week', ms: 7 * 24 * 60 * 60_000 },
] as const
type RangeKey = (typeof RANGES)[number]['key']

export default function App() {
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [range, setRange] = useState<RangeKey>('all')

  const refresh = useCallback(async () => {
    try {
      const ms = RANGES.find((r) => r.key === range)?.ms
      const since = ms ? new Date(Date.now() - ms).toISOString() : undefined
      const [a, s] = await Promise.all([fetchAlerts(50, since), fetchStats()])
      setAlerts(a)
      setStats(s)
      setError(null)
    } catch (err) {
      setError(errorMessage(err))
    }
  }, [range])

  useEffect(() => {
    void refresh()
    const id = setInterval(() => void refresh(), POLL_MS)
    return () => clearInterval(id)
  }, [refresh])

  async function clear() {
    if (!window.confirm('Delete all alerts and reset the counters?')) return
    try {
      await clearAlerts()
      await refresh()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">APIsentry</h1>
        <p className="text-sm text-slate-400">Intelligent API monitoring &amp; alerting</p>
      </header>

      {error && (
        <div role="alert" className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-300">
          Can’t reach the backend: {error}
        </div>
      )}

      <HealthMetrics stats={stats} />

      <div className="mt-6 grid gap-6 lg:grid-cols-[320px_1fr]">
        <SimulationPanel onIngested={() => void refresh()} />

        <section>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">
              Live Incident Stream <span className="ml-2 text-xs font-normal text-slate-500">refreshes every {POLL_MS / 1000}s</span>
            </h2>
            <button
              onClick={() => void clear()}
              className="rounded-lg border border-red-500/40 px-3 py-1 text-xs font-medium text-red-300 transition hover:bg-red-500/10"
            >
              Clear (for test)
            </button>
          </div>
          <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="Time filter">
            {RANGES.map((r) => (
              <button
                key={r.key}
                onClick={() => setRange(r.key)}
                aria-pressed={range === r.key}
                className={`rounded-full border px-3 py-1 text-xs transition ${
                  range === r.key
                    ? 'border-sky-500 bg-sky-500/20 text-sky-200'
                    : 'border-slate-700 text-slate-400 hover:border-slate-500'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
          {alerts.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-800 p-8 text-center text-sm text-slate-500">
              {range === 'all' ? 'No incidents yet — ingest a sample batch to see alerts.' : 'No incidents in this time range.'}
            </p>
          ) : (
            <div className="space-y-3">
              {alerts.map((a) => (
                <AlertCard key={a.id} alert={a} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
