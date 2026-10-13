// Benchmark: BatchService with a stubbed Gemini endpoint (fixed latency).
// Usage: CONCURRENCY_LIMIT=5 npx tsx scripts/benchmark.ts   (one process per concurrency level)
const LATENCY_MS = 300;
const N = 100;

process.env.GEMINI_API_KEY = 'bench-key';
process.env.DATABASE_URL = '';
process.env.NODE_ENV = 'test';

let inFlight = 0;
let peak = 0;
globalThis.fetch = (async () => {
  inFlight++;
  peak = Math.max(peak, inFlight);
  await new Promise((r) => setTimeout(r, LATENCY_MS));
  inFlight--;
  return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'Stubbed diagnostic.' }] } }] }), { status: 200 });
}) as typeof fetch;

const logs = Array.from({ length: N }, (_, i) => ({
  api_name: `api-${i % 10}`,
  response_time_ms: 5000,
  status_code: 500,
  records_returned: 0,
}));

// Dynamic import so env vars above are set before env.ts parses them.
const { BatchService } = await import('../src/services/batch.service.js');
const { MemoryAnomalyRepository } = await import('../src/models/memory.repository.js');
const res = await new BatchService(new MemoryAnomalyRepository()).process(logs);
console.log(
  `concurrency=${process.env.CONCURRENCY_LIMIT ?? '(default 5)'}: ${N} alerts in ${res.processing_time_ms}ms (${Math.round((N / res.processing_time_ms) * 1000)} alerts/s), peak in-flight=${peak}`,
);
