import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { AI_SYSTEM_PROMPT, type SummarySource } from '../utils/constants.js';
import type { Detection } from './detector.js';

export interface AiSummary {
  summary: string;
  source: SummarySource;
}

const DESCRIPTIONS = {
  HIGH_LATENCY: (d: Detection) =>
    `responded in ${Math.round(d.log.response_time_ms)}ms, above the ${env.LATENCY_THRESHOLD_MS}ms threshold`,
  SERVER_ERROR: (d: Detection) => `returned HTTP ${d.log.status_code}`,
  CLIENT_ERROR: (d: Detection) => `returned HTTP ${d.log.status_code}`,
  DATA_MISMATCH: () => 'returned HTTP 200 with zero records',
} as const;

const IMPACTS = {
  SERVER_ERROR: 'requests are failing and downstream consumers are likely impacted',
  HIGH_LATENCY: 'users will see slow responses and callers may start timing out',
  DATA_MISMATCH: 'clients may be silently receiving empty data, suggesting an upstream data or query fault',
  CLIENT_ERROR: 'callers are being rejected, which points to a bad deploy, broken auth, or contract change',
} as const;

/** Deterministic, rule-based 1-sentence diagnostic used whenever Gemini is unavailable. */
export function heuristicSummary(d: Detection): string {
  const facts = d.types.map((t) => DESCRIPTIONS[t](d));
  // Impact follows the most serious type present.
  const top = (['SERVER_ERROR', 'DATA_MISMATCH', 'CLIENT_ERROR', 'HIGH_LATENCY'] as const).find((t) =>
    d.types.includes(t),
  )!;
  // Dedupe in case both status-derived facts collapse to the same wording.
  const joined = [...new Set(facts)].join(' and ');
  return `${d.log.api_name} ${joined}; ${IMPACTS[top]}.`;
}

function buildUserPrompt(d: Detection): string {
  return [
    'Telemetry log:',
    JSON.stringify({
      api_name: d.log.api_name,
      response_time_ms: d.log.response_time_ms,
      status_code: d.log.status_code,
      records_returned: d.log.records_returned,
      detected_issues: d.types,
      latency_threshold_ms: env.LATENCY_THRESHOLD_MS,
    }),
  ].join('\n');
}

// After an auth/model-config failure there is no point hammering Gemini for every remaining alert.
let disabledUntil = 0;
const DISABLE_MS = 60_000;

// Transient Google-side errors (rate limit / internal / overloaded) are retried after a growing delay.
const RETRY_STATUSES = new Set([429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 1_000;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

class GeminiHttpError extends Error {
  constructor(readonly status: number) {
    super(`Gemini responded with HTTP ${status}`);
  }
}

async function callGeminiWithRetry(d: Detection): Promise<string> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await callGemini(d);
    } catch (err) {
      const retryable = err instanceof GeminiHttpError && RETRY_STATUSES.has(err.status);
      if (!retryable || attempt >= MAX_ATTEMPTS) throw err;
      // 1s, 2s, ... plus jitter so parallel alerts don't retry in lockstep.
      await sleep(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1) + Math.random() * 300);
    }
  }
}

async function callGemini(d: Detection): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(env.GEMINI_MODEL)}:generateContent`;
  const res = await fetch(url, {
    method: 'POST',
    // Key goes in a header rather than ?key= so it can never leak through logged URLs.
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY! },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: AI_SYSTEM_PROMPT }] },
      contents: [{ role: 'user', parts: [{ text: buildUserPrompt(d) }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 120 },
    }),
    signal: AbortSignal.timeout(env.AI_TIMEOUT_MS),
  });

  if (!res.ok) {
    if (res.status === 400 || res.status === 401 || res.status === 403 || res.status === 404) {
      disabledUntil = Date.now() + DISABLE_MS;
    }
    throw new GeminiHttpError(res.status);
  }

  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[];
  };
  // Skip "thought" parts (model reasoning) so only the final answer is used.
  const text = data.candidates?.[0]?.content?.parts
    ?.filter((p) => !p.thought)
    .map((p) => p.text ?? '')
    .join('')
    .trim();
  if (!text) throw new Error('Gemini returned an empty completion');
  return text.replace(/\s+/g, ' ');
}

/** Never rejects: any failure degrades to the heuristic summary. */
export async function summarize(d: Detection): Promise<AiSummary> {
  if (!env.GEMINI_API_KEY || Date.now() < disabledUntil) {
    return { summary: heuristicSummary(d), source: 'heuristic' };
  }
  try {
    return { summary: await callGeminiWithRetry(d), source: 'gemini' };
  } catch (err) {
    logger.warn({ api_name: d.log.api_name, reason: (err as Error).message }, 'AI summary failed; using heuristic');
    return { summary: heuristicSummary(d), source: 'heuristic' };
  }
}
