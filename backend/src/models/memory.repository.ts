import type { AlertQuery, Anomaly, AnomalyRepository, BatchStats } from './anomaly.model.js';

const MAX_ITEMS = 10_000; // bound memory in long-running mock mode

export class MemoryAnomalyRepository implements AnomalyRepository {
  readonly kind = 'memory' as const;
  private items: Anomaly[] = [];
  private received = 0;
  private anomalies = 0;
  private rtSum = 0;

  async insertMany(anomalies: Anomaly[]): Promise<void> {
    this.items.push(...anomalies);
    if (this.items.length > MAX_ITEMS) this.items.splice(0, this.items.length - MAX_ITEMS);
  }

  async clear(): Promise<void> {
    this.items = [];
    this.received = 0;
    this.anomalies = 0;
    this.rtSum = 0;
  }

  async list({ api_name, since, limit }: AlertQuery): Promise<Anomaly[]> {
    const filtered = this.items.filter((a) => (!api_name || a.api_name === api_name) && (!since || a.createdAt >= since));
    // Stable newest-first: createdAt DESC, later insertion wins ties.
    return filtered
      .map((a, i) => ({ a, i }))
      .sort((x, y) => (x.a.createdAt < y.a.createdAt ? 1 : x.a.createdAt > y.a.createdAt ? -1 : y.i - x.i))
      .slice(0, limit)
      .map(({ a }) => a);
  }

  async recordBatch(d: { received: number; anomalies: number; responseTimeSumMs: number }): Promise<void> {
    this.received += d.received;
    this.anomalies += d.anomalies;
    this.rtSum += d.responseTimeSumMs;
  }

  async getStats(): Promise<BatchStats> {
    return {
      total_inspected: this.received,
      anomalies_caught: this.anomalies,
      avg_response_time_ms: this.received ? Math.round(this.rtSum / this.received) : 0,
    };
  }

  close(): void {}
}
