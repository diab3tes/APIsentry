# APIsentry — Intelligent API Monitoring & Alert System

Ingests API telemetry (single record or batch), detects anomalies with deterministic rules, asks Gemini for a one-sentence SRE diagnostic per anomaly (with a rule-based fallback), persists alerts in bulk, and shows them on a live dashboard.

## Quick start

```bash
# backend (http://localhost:5000)
cd backend && cp .env.example .env && npm install && npm run dev

# frontend (http://localhost:5173, proxies /api to the backend)
cd frontend && npm install && npm run dev
```

Open the dashboard and click **Ingest Sample Batch (25 APIs)**. No API key is needed; without `GEMINI_API_KEY` alerts use the heuristic summary.

Requirements: Node 20+ (developed on Node 24).

## Configuration (`backend/.env`)

| Variable | Default | Notes |
|---|---|---|
| `PORT` | 5000 | |
| `DATABASE_URL` | *(empty)* | `file:./data/api_monitor.db` → SQLite. Empty → in-memory store. `mongodb://` is not supported and falls back to memory with a warning. |
| `GEMINI_API_KEY` | *(empty)* | Empty → heuristic summaries only |
| `GEMINI_MODEL` | `gemini-1.5-flash` | |
| `CONCURRENCY_LIMIT` | 5 | Max parallel Gemini calls (1–10) |
| `LATENCY_THRESHOLD_MS` | 3000 | |
| `AI_TIMEOUT_MS` | 8000 | Per-call timeout |
| `EMAIL_ALERTS_ENABLED` | false | Digest of critical alerts; with no `SMTP_HOST` an Ethereal test inbox is used and a preview URL is logged |

All variables are validated with Zod in [`backend/src/config/env.ts`](backend/src/config/env.ts); invalid values fail fast at startup.

## API

### `POST /api/monitor`
Body: one object or an array (max 1000) of
`{ "api_name": string, "response_time_ms": number, "status_code": number, "records_returned": number }`

```json
{ "total_received": 25, "healthy": 11, "anomalies_detected": 14, "rejected": 0,
  "processing_time_ms": 2, "alerts": [ … ] }
```

Records are validated individually: malformed ones are listed in `rejected_records` and the rest are processed. If no record is valid the response is `400`.

### `GET /api/alerts?api_name=&limit=`
Newest first (`createdAt` DESC). `limit` defaults to 50, max 500.

### Also
`GET /api/stats` (dashboard counters over *all* inspected records, healthy included) and `GET /api/health`.

### Detection rules

| Rule | Type |
|---|---|
| `response_time_ms > LATENCY_THRESHOLD_MS` | `HIGH_LATENCY` |
| `status_code >= 500` | `SERVER_ERROR` |
| `400 <= status_code < 500` | `CLIENT_ERROR` |
| `status_code === 200 && records_returned === 0` | `DATA_MISMATCH` |

Severity is `critical` for any 5xx, for multiple simultaneous issues, or for latency above 2× the threshold; otherwise `warning`.

## Asynchronous design

```
POST /api/monitor
  ├─ 1. sync, O(N): per-record Zod validation + rule evaluation   (no I/O)
  ├─ 2. async: p-limit(CONCURRENCY_LIMIT) → Promise.allSettled(summarize(...))
  ├─ 3. one bulk insert (single SQLite transaction) + one stats update
  └─ 4. fire-and-forget email digest (never awaited)
```

- **Bounded concurrency.** `Promise.all` over 50 alerts would fire 50 simultaneous requests and trigger HTTP 429s; a sequential `for…await` would take N × latency. A `p-limit` pool keeps at most `CONCURRENCY_LIMIT` calls in flight.
- **Fault isolation.** `Promise.allSettled` plus a `summarize()` that never rejects means one timeout, 429 or bad response only degrades *that* alert to the heuristic summary. The other alerts in the batch are unaffected.
- **No N+1 writes.** All anomalies go in with one `insertMany` (a single transaction, one fsync).
- **Auth circuit-breaker.** A 400/401/403/404 from Gemini (bad key or model name) makes the service skip Gemini for 60 s instead of failing every remaining call.
- **Gemini via native `fetch`.** No AI SDKs. The key is sent in the `x-goog-api-key` header rather than the `?key=` query string so it can't end up in logged URLs.

### Benchmark

[`backend/scripts/benchmark.ts`](backend/scripts/benchmark.ts): 100 critical alerts, Gemini stubbed with a fixed 300 ms latency, in-memory store.

| `CONCURRENCY_LIMIT` | Time | Throughput | Peak in-flight |
|---|---|---|---|
| 1 (sequential) | 30.8 s | 3 alerts/s | 1 |
| 3 | 10.5 s | 10 alerts/s | 3 |
| 5 | 6.2 s | 16 alerts/s | 5 |

Throughput scales with the limit, and in-flight calls never exceed it. Real throughput depends on Gemini latency and your quota. Rule evaluation itself is sub-millisecond for batches this size; with no API key the 25-record sample batch completes in a few milliseconds.

Run it yourself: `CONCURRENCY_LIMIT=5 npx tsx scripts/benchmark.ts` (in `backend/`).

## Project layout

```
backend/src/{config,controllers,services,models,routes,middlewares,utils}  server.ts  app.ts
frontend/src/{components,services}  App.tsx
sample_data/{large_batch_sample.json,mock_api_logs.json}
AI_Prompts.md
```

Persistence sits behind an `AnomalyRepository` interface ([`models/anomaly.model.ts`](backend/src/models/anomaly.model.ts)) with SQLite and in-memory implementations.

## Known limitations

- No automated test suite yet; behaviour was verified manually via the HTTP endpoints and the benchmark script.
- Gemini integration has not been exercised against the live API in development; the request shape follows the public `generateContent` REST spec.
- The dashboard polls every 5 s rather than using websockets/SSE.
- No authentication or rate limiting on the API.
