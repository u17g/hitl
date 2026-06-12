import type { ApprovalRecord, ApprovalResult, NewApprovalRecord, Store } from "@hitldev/sdk";

/**
 * Structural subset of `pg.Pool` / `pg.Client`. Pass a real node-postgres
 * pool (or anything query-compatible, e.g. a pg-mem adapter) — this package
 * has no runtime dependency on a driver.
 */
export interface PgQueryable {
  query(text: string, values?: unknown[]): Promise<{ rows: any[]; rowCount: number | null }>;
}

export interface PostgresStoreOptions {
  /** Defaults to `hitldev.approvals`. */
  tableName?: string;
}

const DEFAULT_TABLE = "hitldev.approvals";
const IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const QUALIFIED = /^[a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_]*)?$/;

interface ResolvedTable {
  /** SQL fragment for FROM/INTO/UPDATE clauses */
  sql: string;
  indexName: string;
  schema?: string;
  table: string;
}

/** Idempotent DDL for the approvals table; also used by `ensureSchema()`. */
export function schemaSql(tableName = DEFAULT_TABLE): string {
  const resolved = resolveTableName(tableName);
  const schemaDdl = resolved.schema
    ? `CREATE SCHEMA IF NOT EXISTS ${resolved.schema};\n`
    : "";
  return `
    ${schemaDdl}CREATE TABLE IF NOT EXISTS ${resolved.sql} (
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
    CREATE INDEX IF NOT EXISTS ${resolved.indexName}
      ON ${resolved.sql} (external_id);
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
 * `@hitldev/store-sqlite`, the constructor cannot create the schema because
 * queries are async.
 */
export class PostgresStore implements Store {
  private readonly pool: PgQueryable;
  private readonly table: ResolvedTable;

  constructor(pool: PgQueryable, options?: PostgresStoreOptions) {
    this.pool = pool;
    this.table = resolveTableName(options?.tableName ?? DEFAULT_TABLE);
  }

  async ensureSchema(): Promise<void> {
    try {
      await this.pool.query(`SELECT 1 FROM ${this.table.sql} LIMIT 0`);
      return;
    } catch {
      // Table or schema missing — apply DDL below.
    }
    await this.pool.query(schemaSql(qualifiedTableName(this.table)));
  }

  async create(record: NewApprovalRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO ${this.table.sql} (id, token, channel, message, fields, status, created_at)
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
    const { rows } = await this.pool.query(`SELECT * FROM ${this.table.sql} WHERE id = $1`, [id]);
    return rows[0] ? rowToRecord(rows[0]) : null;
  }

  async findByExternalId(externalId: string): Promise<ApprovalRecord | null> {
    const { rows } = await this.pool.query(
      `SELECT * FROM ${this.table.sql} WHERE external_id = $1`,
      [externalId],
    );
    return rows[0] ? rowToRecord(rows[0]) : null;
  }

  async setExternalId(id: string, externalId: string): Promise<void> {
    const { rowCount } = await this.pool.query(
      `UPDATE ${this.table.sql} SET external_id = $2 WHERE id = $1`,
      [id, externalId],
    );
    if (!rowCount) throw new Error(`Unknown approval "${id}"`);
  }

  async resolve(id: string, result: ApprovalResult): Promise<void> {
    const { rowCount } = await this.pool.query(
      `UPDATE ${this.table.sql} SET status = 'resolved', result = $2::jsonb, resolved_at = $3
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
      ? await this.pool.query(`SELECT * FROM ${this.table.sql} WHERE status = $1`, [filter.status])
      : await this.pool.query(`SELECT * FROM ${this.table.sql}`);
    return rows.map(rowToRecord);
  }
}

function resolveTableName(tableName: string): ResolvedTable {
  if (!QUALIFIED.test(tableName)) {
    throw new Error(`Invalid table name "${tableName}"`);
  }
  if (tableName.includes(".")) {
    const parts = tableName.split(".");
    const schema = parts[0];
    const table = parts[1];
    if (!schema || !table || parts.length !== 2) {
      throw new Error(`Invalid table name "${tableName}"`);
    }
    assertIdentifier(schema);
    assertIdentifier(table);
    return {
      sql: `${schema}.${table}`,
      indexName: `${schema}_${table}_external_id_idx`,
      schema,
      table,
    };
  }
  assertIdentifier(tableName);
  return {
    sql: tableName,
    indexName: `${tableName}_external_id_idx`,
    table: tableName,
  };
}

function qualifiedTableName(resolved: ResolvedTable): string {
  return resolved.schema ? `${resolved.schema}.${resolved.table}` : resolved.table;
}

function assertIdentifier(name: string): void {
  if (!IDENTIFIER.test(name)) {
    throw new Error(`Invalid table name "${name}"`);
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
