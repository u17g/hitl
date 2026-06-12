import type { DatabaseSync } from "node:sqlite";
import type { ApprovalRecord, ApprovalResult, NewApprovalRecord, Store } from "@hitldev/sdk";
import { applyMigrations } from "./migrate.js";
import { schemaSql as buildSchemaSql } from "./schema-sql.js";
import { DEFAULT_TABLE, resolveTableName } from "./table.js";

export { DEFAULT_TABLE } from "./table.js";
export { SCHEMA_VERSION } from "./migrations/index.js";
export { migrationSql } from "./schema-sql.js";

export interface SqliteStoreOptions {
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
  fields: string;
  status: string;
  external_id: string | null;
  result: string | null;
  created_at: string;
  resolved_at: string | null;
}

/**
 * `Store` backed by `node:sqlite`. The schema is created automatically in the
 * constructor (synchronous and idempotent) — unlike `@hitldev/store-postgres`,
 * no explicit `ensureSchema()` call is needed.
 */
export class SqliteStore implements Store {
  private readonly db: DatabaseSync;
  private readonly tableName: string;
  private readonly table: ReturnType<typeof resolveTableName>;

  constructor(database: DatabaseSync, options?: SqliteStoreOptions) {
    this.db = database;
    this.tableName = options?.tableName ?? DEFAULT_TABLE;
    this.table = resolveTableName(this.tableName);
    this.ensureSchema();
  }

  /** Idempotent; already run by the constructor. */
  ensureSchema(): void {
    applyMigrations(this.db, this.tableName);
  }

  async create(record: NewApprovalRecord): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO ${this.table.sql} (id, token, channel, message, fields, status, created_at)
         VALUES (?, ?, ?, ?, ?, 'pending', ?)`,
      )
      .run(
        record.id,
        record.token,
        record.channel,
        record.message,
        JSON.stringify(record.fields),
        new Date().toISOString(),
      );
  }

  async get(id: string): Promise<ApprovalRecord | null> {
    const row = this.db.prepare(`SELECT * FROM ${this.table.sql} WHERE id = ?`).get(id) as
      | ApprovalRow
      | undefined;
    return row ? rowToRecord(row) : null;
  }

  async findByExternalId(externalId: string): Promise<ApprovalRecord | null> {
    const row = this.db
      .prepare(`SELECT * FROM ${this.table.sql} WHERE external_id = ?`)
      .get(externalId) as ApprovalRow | undefined;
    return row ? rowToRecord(row) : null;
  }

  async setExternalId(id: string, externalId: string): Promise<void> {
    const { changes } = this.db
      .prepare(`UPDATE ${this.table.sql} SET external_id = ? WHERE id = ?`)
      .run(externalId, id);
    if (changes === 0) throw new Error(`Unknown approval "${id}"`);
  }

  async resolve(id: string, result: ApprovalResult): Promise<void> {
    const { changes } = this.db
      .prepare(
        `UPDATE ${this.table.sql} SET status = 'resolved', result = ?, resolved_at = ?
         WHERE id = ? AND status = 'pending'`,
      )
      .run(JSON.stringify(result), new Date().toISOString(), id);
    if (changes === 0) {
      const record = await this.get(id);
      if (record) throw new Error(`Approval "${id}" is already resolved`);
      throw new Error(`Unknown approval "${id}"`);
    }
  }

  async list(filter?: { status?: ApprovalRecord["status"] }): Promise<ApprovalRecord[]> {
    const rows = (
      filter?.status
        ? this.db.prepare(`SELECT * FROM ${this.table.sql} WHERE status = ?`).all(filter.status)
        : this.db.prepare(`SELECT * FROM ${this.table.sql}`).all()
    ) as unknown as ApprovalRow[];
    return rows.map(rowToRecord);
  }
}

function rowToRecord(row: ApprovalRow): ApprovalRecord {
  return {
    id: row.id,
    token: row.token,
    channel: row.channel,
    message: row.message,
    fields: JSON.parse(row.fields),
    status: row.status as ApprovalRecord["status"],
    externalId: row.external_id ?? undefined,
    result: row.result === null ? undefined : JSON.parse(row.result),
    createdAt: row.created_at,
    resolvedAt: row.resolved_at ?? undefined,
  };
}
