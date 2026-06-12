import type { ApprovalRecord, ApprovalResult, NewApprovalRecord, Store } from "@hitldev/sdk";
import { applyMigrations, type PgQueryable } from "./migrate.js";
import { schemaSql as buildSchemaSql } from "./schema-sql.js";
import { DEFAULT_TABLE, resolveTableName } from "./table.js";

export type { PgQueryable } from "./migrate.js";
export { DEFAULT_TABLE } from "./table.js";
export { SCHEMA_VERSION } from "./migrations/index.js";
export { migrationSql } from "./schema-sql.js";

export interface PostgresStoreOptions {
  /** Defaults to `hitldev.approvals`. */
  tableName?: string;
}

/** Idempotent DDL for the approvals table; also used by `ensureSchema()`. */
export function schemaSql(tableName = DEFAULT_TABLE): string {
  return buildSchemaSql(tableName);
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
  private readonly table: ReturnType<typeof resolveTableName>;
  private readonly tableName: string;

  constructor(pool: PgQueryable, options?: PostgresStoreOptions) {
    this.pool = pool;
    this.tableName = options?.tableName ?? DEFAULT_TABLE;
    this.table = resolveTableName(this.tableName);
  }

  async ensureSchema(): Promise<void> {
    await applyMigrations(this.pool, this.tableName);
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
