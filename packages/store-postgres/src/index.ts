import type { ApprovalRecord, ApprovalResult, NewApprovalRecord, Store } from "@openhitl/sdk";

/**
 * Structural subset of `pg.Pool` / `pg.Client`. Pass a real node-postgres
 * pool (or anything query-compatible, e.g. a pg-mem adapter) — this package
 * has no runtime dependency on a driver.
 */
export interface PgQueryable {
  query(text: string, values?: unknown[]): Promise<{ rows: any[]; rowCount: number | null }>;
}

export interface PostgresStoreOptions {
  /** Defaults to `openhitl_approvals`. */
  tableName?: string;
}

const IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

/** Idempotent DDL for the approvals table; also used by `ensureSchema()`. */
export function schemaSql(tableName = "openhitl_approvals"): string {
  assertIdentifier(tableName);
  return `
    CREATE TABLE IF NOT EXISTS ${tableName} (
      id          TEXT PRIMARY KEY,
      token       TEXT NOT NULL,
      channel     TEXT NOT NULL,
      message     TEXT NOT NULL,
      fields      JSONB NOT NULL,
      status      TEXT NOT NULL,
      external_id TEXT,
      result      JSONB,
      created_at  TEXT NOT NULL,
      resolved_at TEXT
    );
    CREATE INDEX IF NOT EXISTS ${tableName}_external_id_idx
      ON ${tableName} (external_id);
  `;
}

interface ApprovalRow {
  id: string;
  token: string;
  channel: string;
  message: string;
  fields: ApprovalRecord["fields"];
  status: string;
  external_id: string | null;
  result: ApprovalResult | null;
  created_at: string;
  resolved_at: string | null;
}

/**
 * `Store` backed by Postgres. Call `await store.ensureSchema()` once at
 * startup (or apply `schemaSql()` through your own migrations) — unlike
 * `@openhitl/store-sqlite`, the constructor cannot create the schema because
 * queries are async.
 */
export class PostgresStore implements Store {
  private readonly pool: PgQueryable;
  private readonly table: string;

  constructor(pool: PgQueryable, options?: PostgresStoreOptions) {
    const table = options?.tableName ?? "openhitl_approvals";
    assertIdentifier(table);
    this.pool = pool;
    this.table = table;
  }

  async ensureSchema(): Promise<void> {
    // Skip the DDL when the table already exists: pg-mem rejects a re-run of
    // CREATE TABLE IF NOT EXISTS that carries column constraints. Unquoted
    // identifiers fold to lowercase in Postgres, hence the comparison.
    const { rows } = await this.pool.query(
      `SELECT 1 FROM information_schema.tables WHERE table_name = $1`,
      [this.table.toLowerCase()],
    );
    if (rows.length > 0) return;
    await this.pool.query(schemaSql(this.table));
  }

  async create(record: NewApprovalRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO ${this.table} (id, token, channel, message, fields, status, created_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, 'pending', $6)`,
      [
        record.id,
        record.token,
        record.channel,
        record.message,
        JSON.stringify(record.fields),
        new Date().toISOString(),
      ],
    );
  }

  async get(id: string): Promise<ApprovalRecord | null> {
    const { rows } = await this.pool.query(`SELECT * FROM ${this.table} WHERE id = $1`, [id]);
    return rows[0] ? rowToRecord(rows[0]) : null;
  }

  async findByExternalId(externalId: string): Promise<ApprovalRecord | null> {
    const { rows } = await this.pool.query(
      `SELECT * FROM ${this.table} WHERE external_id = $1`,
      [externalId],
    );
    return rows[0] ? rowToRecord(rows[0]) : null;
  }

  async setExternalId(id: string, externalId: string): Promise<void> {
    const { rowCount } = await this.pool.query(
      `UPDATE ${this.table} SET external_id = $2 WHERE id = $1`,
      [id, externalId],
    );
    if (!rowCount) throw new Error(`Unknown approval "${id}"`);
  }

  async resolve(id: string, result: ApprovalResult): Promise<void> {
    const { rowCount } = await this.pool.query(
      `UPDATE ${this.table} SET status = 'resolved', result = $2::jsonb, resolved_at = $3
       WHERE id = $1 AND status = 'pending'`,
      [id, JSON.stringify(result), new Date().toISOString()],
    );
    if (!rowCount) {
      const record = await this.get(id);
      if (record) throw new Error(`Approval "${id}" is already resolved`);
      throw new Error(`Unknown approval "${id}"`);
    }
  }

  async list(filter?: { status?: ApprovalRecord["status"] }): Promise<ApprovalRecord[]> {
    const { rows } = filter?.status
      ? await this.pool.query(`SELECT * FROM ${this.table} WHERE status = $1`, [filter.status])
      : await this.pool.query(`SELECT * FROM ${this.table}`);
    return rows.map(rowToRecord);
  }
}

function assertIdentifier(tableName: string): void {
  if (!IDENTIFIER.test(tableName)) {
    throw new Error(`Invalid table name "${tableName}"`);
  }
}

function rowToRecord(row: ApprovalRow): ApprovalRecord {
  return {
    id: row.id,
    token: row.token,
    channel: row.channel,
    message: row.message,
    fields: row.fields,
    status: row.status as ApprovalRecord["status"],
    externalId: row.external_id ?? undefined,
    result: row.result ?? undefined,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at ?? undefined,
  };
}
