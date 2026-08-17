import pg from 'pg';
import type { ArchiveQuery, Domain, JsonObject, NormalizedRecord } from '../types.js';
import { contentHash, log } from '../util.js';

const { Pool } = pg;

export interface ArchiveItem {
  domain: Domain;
  source: string;
  title: string;
  observed_at: string;
  kind: 'record_version' | 'observation';
  payload: JsonObject;
}

export class PgStore {
  readonly pool: pg.Pool;

  constructor(databaseUrl: string) {
    this.pool = new Pool({ connectionString: databaseUrl, max: 10, idleTimeoutMillis: 30_000 });
    this.pool.on('error', (error) => log('error', 'Unexpected PostgreSQL pool error', { error: error.message }));
  }

  async migrate(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('SELECT pg_advisory_lock(hashtext($1))', ['swatgpt:migrations']);
      await client.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          version integer PRIMARY KEY,
          applied_at timestamptz NOT NULL DEFAULT now()
        );
      `);
      const applied = await client.query<{ version: number }>('SELECT version FROM schema_migrations WHERE version = 1');
      if (!applied.rowCount) {
        await client.query('BEGIN');
        await client.query(`
          CREATE TABLE source_records (
            id bigserial PRIMARY KEY,
            domain text NOT NULL,
            source text NOT NULL,
            external_id text NOT NULL,
            title text NOT NULL,
            search_text text NOT NULL DEFAULT '',
            event_start timestamptz,
            event_end timestamptz,
            published_at timestamptz,
            first_seen_at timestamptz NOT NULL,
            last_seen_at timestamptz NOT NULL,
            active boolean NOT NULL DEFAULT true,
            payload_hash text NOT NULL,
            payload jsonb NOT NULL,
            UNIQUE (domain, source, external_id)
          );
          CREATE TABLE record_versions (
            id bigserial PRIMARY KEY,
            record_id bigint NOT NULL REFERENCES source_records(id) ON DELETE CASCADE,
            observed_at timestamptz NOT NULL,
            payload_hash text NOT NULL,
            payload jsonb NOT NULL,
            UNIQUE (record_id, observed_at)
          );
          CREATE TABLE observations (
            id bigserial PRIMARY KEY,
            domain text NOT NULL,
            source text NOT NULL,
            observed_at timestamptz NOT NULL,
            payload_hash text NOT NULL,
            payload jsonb NOT NULL
          );
          CREATE TABLE sync_runs (
            id bigserial PRIMARY KEY,
            job text NOT NULL,
            started_at timestamptz NOT NULL DEFAULT now(),
            completed_at timestamptz,
            status text NOT NULL DEFAULT 'running',
            error text
          );
          CREATE INDEX source_records_domain_active_idx ON source_records(domain, active, last_seen_at DESC);
          CREATE INDEX source_records_event_idx ON source_records(domain, event_start, event_end);
          CREATE INDEX source_records_search_idx ON source_records USING gin(to_tsvector('english', search_text));
          CREATE INDEX record_versions_observed_idx ON record_versions(observed_at DESC);
          CREATE INDEX observations_domain_observed_idx ON observations(domain, observed_at DESC);
          CREATE INDEX sync_runs_job_started_idx ON sync_runs(job, started_at DESC);
        `);
        await client.query('INSERT INTO schema_migrations(version) VALUES (1)');
        await client.query('COMMIT');
      }
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      await client.query('SELECT pg_advisory_unlock(hashtext($1))', ['swatgpt:migrations']).catch(() => undefined);
      client.release();
    }
  }

  async ping(): Promise<boolean> {
    try {
      await this.pool.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async replaceSourceRecords(domain: Domain, source: string, records: NormalizedRecord[], observedAt = new Date()): Promise<void> {
    const client = await this.pool.connect();
    const timestamp = observedAt.toISOString();
    try {
      await client.query('BEGIN');
      for (const record of records) {
        const hash = contentHash(record.payload);
        const previous = await client.query<{ id: string; payload_hash: string }>(
          'SELECT id, payload_hash FROM source_records WHERE domain=$1 AND source=$2 AND external_id=$3',
          [domain, source, record.externalId],
        );
        const payload = JSON.stringify({
          id: record.externalId,
          title: record.title,
          description: record.description,
          category: record.category,
          location: record.location,
          url: record.url,
          start: record.start,
          end: record.end,
          published: record.published,
          source: record.source,
          details: record.payload,
        });
        const result = await client.query<{ id: string }>(`
          INSERT INTO source_records (
            domain, source, external_id, title, search_text, event_start, event_end, published_at,
            first_seen_at, last_seen_at, active, payload_hash, payload
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9,true,$10,$11::jsonb)
          ON CONFLICT (domain, source, external_id) DO UPDATE SET
            title=EXCLUDED.title, search_text=EXCLUDED.search_text, event_start=EXCLUDED.event_start,
            event_end=EXCLUDED.event_end, published_at=EXCLUDED.published_at, last_seen_at=EXCLUDED.last_seen_at,
            active=true, payload_hash=EXCLUDED.payload_hash, payload=EXCLUDED.payload
          RETURNING id
        `, [domain, source, record.externalId, record.title, record.searchText, nullableDate(record.start), nullableDate(record.end), nullableDate(record.published), timestamp, hash, payload]);
        const id = result.rows[0]!.id;
        if (!previous.rows[0] || previous.rows[0].payload_hash !== hash) {
          await client.query(`
            INSERT INTO record_versions(record_id, observed_at, payload_hash, payload)
            VALUES ($1,$2,$3,$4::jsonb) ON CONFLICT (record_id, observed_at) DO NOTHING
          `, [id, timestamp, hash, payload]);
        }
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async addObservation(domain: Extract<Domain, 'weather' | 'transit'>, source: string, payload: JsonObject, observedAt = new Date()): Promise<void> {
    await this.pool.query(
      'INSERT INTO observations(domain,source,observed_at,payload_hash,payload) VALUES ($1,$2,$3,$4,$5::jsonb)',
      [domain, source, observedAt.toISOString(), contentHash(payload), JSON.stringify(payload)],
    );
  }

  async currentRecords(domain: Domain, limit = 100): Promise<JsonObject[]> {
    const result = await this.pool.query<{ payload: JsonObject }>(
      'SELECT payload FROM source_records WHERE domain=$1 AND active=true ORDER BY last_seen_at DESC LIMIT $2',
      [domain, limit],
    );
    return result.rows.map((row) => row.payload);
  }

  async latestRecordObservedAt(domain: Domain): Promise<string | undefined> {
    const result = await this.pool.query<{ last_seen_at: Date }>(
      'SELECT last_seen_at FROM source_records WHERE domain=$1 ORDER BY last_seen_at DESC LIMIT 1',
      [domain],
    );
    return result.rows[0]?.last_seen_at.toISOString();
  }

  async latestObservation(domain: Extract<Domain, 'weather' | 'transit'>, source?: string): Promise<{ payload: JsonObject; observed_at: string } | undefined> {
    const result = await this.pool.query<{ payload: JsonObject; observed_at: Date }>(
      `SELECT payload, observed_at FROM observations WHERE domain=$1 AND ($2::text IS NULL OR source=$2)
       ORDER BY observed_at DESC LIMIT 1`,
      [domain, source ?? null],
    );
    const row = result.rows[0];
    return row ? { payload: row.payload, observed_at: row.observed_at.toISOString() } : undefined;
  }

  async searchArchive(query: ArchiveQuery): Promise<ArchiveItem[]> {
    const pattern = query.query ? `%${query.query.replace(/[\\%_]/g, '\\$&')}%` : null;
    const result = await this.pool.query<ArchiveItem>(`
      SELECT sr.domain, sr.source, sr.title, rv.observed_at, 'record_version'::text AS kind, rv.payload
      FROM record_versions rv JOIN source_records sr ON sr.id=rv.record_id
      WHERE sr.domain=$1 AND rv.observed_at BETWEEN $2 AND $3
        AND ($4::text IS NULL OR sr.search_text ILIKE $4 ESCAPE '\\' OR rv.payload::text ILIKE $4 ESCAPE '\\')
      UNION ALL
      SELECT o.domain, o.source, o.source AS title, o.observed_at, 'observation'::text AS kind, o.payload
      FROM observations o
      WHERE o.domain=$1 AND o.observed_at BETWEEN $2 AND $3
        AND ($4::text IS NULL OR o.payload::text ILIKE $4 ESCAPE '\\')
      ORDER BY observed_at DESC LIMIT $5
    `, [query.domain, query.observedFrom, query.observedTo, pattern, query.limit]);
    return result.rows.map((row) => ({ ...row, observed_at: new Date(row.observed_at).toISOString() }));
  }

  async withJobLock(job: string, task: (runId: string) => Promise<void>): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      const lock = await client.query<{ locked: boolean }>('SELECT pg_try_advisory_lock(hashtext($1)) AS locked', [`swatgpt:${job}`]);
      if (!lock.rows[0]?.locked) return false;
      const run = await client.query<{ id: string }>('INSERT INTO sync_runs(job) VALUES ($1) RETURNING id', [job]);
      const runId = run.rows[0]!.id;
      try {
        await task(runId);
        await client.query("UPDATE sync_runs SET completed_at=now(), status='success' WHERE id=$1", [runId]);
      } catch (error) {
        await client.query("UPDATE sync_runs SET completed_at=now(), status='error', error=$2 WHERE id=$1", [runId, error instanceof Error ? error.message.slice(0, 4_000) : String(error)]);
        throw error;
      } finally {
        await client.query('SELECT pg_advisory_unlock(hashtext($1))', [`swatgpt:${job}`]);
      }
      return true;
    } finally {
      client.release();
    }
  }

  async pruneObservations(days: number): Promise<number> {
    const result = await this.pool.query('DELETE FROM observations WHERE observed_at < now() - ($1 * interval \'1 day\')', [days]);
    return result.rowCount ?? 0;
  }

  async status(): Promise<JsonObject[]> {
    const result = await this.pool.query(`
      SELECT DISTINCT ON (job) job, started_at, completed_at, status, error
      FROM sync_runs ORDER BY job, started_at DESC
    `);
    return result.rows;
  }
}

function nullableDate(value?: string): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}
