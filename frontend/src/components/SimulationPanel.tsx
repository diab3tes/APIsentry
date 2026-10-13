import { useState } from 'react'
import sample from '../../../sample_data/large_batch_sample.json'
import { errorMessage, ingestBatch, type ApiLog, type MonitorResult } from '../services/api'

type Status = { kind: 'idle' } | { kind: 'running' } | { kind: 'done'; result: MonitorResult; roundTripMs: number } | { kind: 'error'; message: string }

export function SimulationPanel({ onIngested }: { onIngested: () => void }) {
  const [status, setStatus] = useState<Status>({ kind: 'idle' })

  async function run() {
    setStatus({ kind: 'running' })
    const t0 = performance.now()
    try {
      const result = await ingestBatch(sample as ApiLog[])
      setStatus({ kind: 'done', result, roundTripMs: Math.round(performance.now() - t0) })
      onIngested()
    } catch (err) {
      setStatus({ kind: 'error', message: errorMessage(err) })
    }
  }

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900 p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">Batch Simulation</h2>
      <button
        onClick={run}
        disabled={status.kind === 'running'}
        className="mt-4 w-full rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {status.kind === 'running' ? 'Ingesting…' : 'Ingest Sample Batch (25 APIs)'}
      </button>

      <div className="mt-4 text-sm" aria-live="polite">
        {status.kind === 'idle' && <p className="text-slate-500">No batch ingested yet.</p>}
        {status.kind === 'running' && <p className="text-sky-300">Processing batch…</p>}
        {status.kind === 'error' && <p className="text-red-400">Failed: {status.message}</p>}
        {status.kind === 'done' && (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-slate-300">
            <dt className="text-slate-500">Received</dt><dd className="text-right tabular-nums">{status.result.total_received}</dd>
            <dt className="text-slate-500">Healthy</dt><dd className="text-right tabular-nums text-emerald-400">{status.result.healthy}</dd>
            <dt className="text-slate-500">Anomalies</dt><dd className="text-right tabular-nums text-amber-400">{status.result.anomalies_detected}</dd>
            <dt className="text-slate-500">Server time</dt><dd className="text-right tabular-nums">{status.result.processing_time_ms} ms</dd>
            <dt className="text-slate-500">Round trip</dt><dd className="text-right tabular-nums">{status.roundTripMs} ms</dd>
          </dl>
        )}
      </div>
    </section>
  )
}
