import Database from 'better-sqlite3';
import type { AlertQuery, Anomaly, AnomalyRepository, BatchStats } from './anomaly.model.js';

interface AnomalyRow {
  id: string;
  api_name: string;
  response_time_ms: number;
  status_code: number;
  records_returned: number;
  anomaly_types: string;
  severity: Anomaly['severity'];
  ai_summary: string;
  summary_source: Anomaly['summary_source'];
  createdAt: string;
}

export class SqliteAnomalyRepository implements AnomalyRepository {
  readonly kind = 'sqlite' as const;
  private db: Database.Database;
  private insertStmt: Database.Statement;
  private insertTx: (rows: Anomaly[]) => void;

  constructor(filePath: string) {
    this.db = new Database(filePath);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS anomalies (
        id TEXT PRIMARY KEY,
        api_name TEXT NOT NULL,
        response_time_ms REAL NOT NULL,
        status_code INTEGER NOT NULL,
        records_returned INTEGER NOT NULL,
        anomaly_types TEXT NOT NULL,
        severity TEXT NOT NULL,
        ai_summary TEXT NOT NULL,
        summary_source TEXT NOT NULL,
        createdAt TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_anomalies_created ON anomalies (createdAt DESC);
      CREATE INDEX IF NOT EXISTS idx_anomalies_api ON anomalies (api_name, createdAt DESC);
      CREATE TABLE IF NOT EXISTS stats (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        received INTEGER NOT NULL,
        anomalies INTEGER NOT NULL,
        rt_sum REAL NOT NULL
      );
      INSERT OR IGNORE INTO stats (id, received, anomalies, rt_sum) VALUES (1, 0, 0, 0);
    `);

    this.insertStmt = this.db.prepare(`
      INSERT INTO anomalies (id, api_name, response_time_ms, status_code, records_returned,
        anomaly_types, severity, ai_summary, summary_source, createdAt)
      VALUES (@id, @api_name, @response_time_ms, @status_code, @records_returned,
        @anomaly_types, @severity, @ai_summary, @summary_source, @createdAt)`);
    // One transaction => one fsync for the whole batch instead of N.
    this.insertTx = this.db.transaction((rows: Anomaly[]) => {
      for (const r of rows) this.insertStmt.run({ ...r, anomaly_types: JSON.stringify(r.anomaly_types) });
    });
  }

  async insertMany(anomalies: Anomaly[]): Promise<void> {
    if (anomalies.length) this.insertTx(anomalies);
  }

  async clear(): Promise<void> {
    this.db.transaction(() => {
      this.db.prepare('DELETE FROM anomalies').run();
      this.db.prepare('UPDATE stats SET received = 0, anomalies = 0, rt_sum = 0 WHERE id = 1').run();
    })();
  }

  async list({ api_name, since, limit }: AlertQuery): Promise<Anomaly[]> {
    const where: string[] = [];
    const params: (string | number)[] = [];
    if (api_name) {
      where.push('api_name = ?');
      params.push(api_name);
    }
    if (since) {
      where.push('createdAt >= ?');
      params.push(since);
    }
    const sql = `SELECT * FROM anomalies ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY createdAt DESC, rowid DESC LIMIT ?`;
    const rows = this.db.prepare(sql).all(...params, limit) as AnomalyRow[];
    return rows.map((r) => ({ ...r, anomaly_types: JSON.parse(r.anomaly_types) as Anomaly['anomaly_types'] }));
  }

  async recordBatch(d: { received: number; anomalies: number; responseTimeSumMs: number }): Promise<void> {
    this.db
      .prepare('UPDATE stats SET received = received + ?, anomalies = anomalies + ?, rt_sum = rt_sum + ? WHERE id = 1')
      .run(d.received, d.anomalies, d.responseTimeSumMs);
  }

  async getStats(): Promise<BatchStats> {
    const s = this.db.prepare('SELECT received, anomalies, rt_sum FROM stats WHERE id = 1').get() as {
      received: number;
      anomalies: number;
      rt_sum: number;
    };
    return {
      total_inspected: s.received,
      anomalies_caught: s.anomalies,
      avg_response_time_ms: s.received ? Math.round(s.rt_sum / s.received) : 0,
    };
  }

  close(): void {
    this.db.close();
  }
}
