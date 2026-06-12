import type { DatabaseSync } from "node:sqlite";
import type { ApprovalRecord, ApprovalResult, NewApprovalRecord, Store } from "@openhitl/sdk";

export interface SqliteStoreOptions {
  /** Defaults to `openhitl_approvals`. */
  tableName?: string;
}

const IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

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
 * constructor (synchronous and idempotent) — unlike `@openhitl/store-postgres`,
 * no explicit `ensureSchema()` call is needed.
 */
export class SqliteStore implements Store {
  private readonly db: DatabaseSync;
  private readonly table: string;

  constructor(database: DatabaseSync, options?: SqliteStoreOptions) {
    const table = options?.tableName ?? "openhitl_approvals";
    if (!IDENTIFIER.test(table)) {
      throw new Error(`Invalid table name "${table}"`);
    }
    this.db = database;
    this.table = table;
    this.ensureSchema();
  }

  /** Idempotent; already run by the constructor. */
  ensureSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ${this.table} (
        id          TEXT PRIMARY KEY,
        token       TEXT NOT NULL,
        channel     TEXT NOT NULL,
        message     TEXT NOT NULL,
        fields      TEXT NOT NULL,
        status      TEXT NOT NULL,
        external_id TEXT,
        result      TEXT,
        created_at  TEXT NOT NULL,
        resolved_at TEXT
      );
      CREATE INDEX IF NOT EXISTS ${this.table}_external_id_idx
        ON ${this.table} (external_id);
    `);
  }

  async create(record: NewApprovalRecord): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO ${this.table} (id, token, channel, message, fields, status, created_at)
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
    const row = this.db.prepare(`SELECT * FROM ${this.table} WHERE id = ?`).get(id) as
      | ApprovalRow
      | undefined;
    return row ? rowToRecord(row) : null;
  }

  async findByExternalId(externalId: string): Promise<ApprovalRecord | null> {
    const row = this.db
      .prepare(`SELECT * FROM ${this.table} WHERE external_id = ?`)
      .get(externalId) as ApprovalRow | undefined;
    return row ? rowToRecord(row) : null;
  }

  async setExternalId(id: string, externalId: string): Promise<void> {
    const { changes } = this.db
      .prepare(`UPDATE ${this.table} SET external_id = ? WHERE id = ?`)
      .run(externalId, id);
    if (changes === 0) throw new Error(`Unknown approval "${id}"`);
  }

  async resolve(id: string, result: ApprovalResult): Promise<void> {
    const { changes } = this.db
      .prepare(
        `UPDATE ${this.table} SET status = 'resolved', result = ?, resolved_at = ?
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
        ? this.db.prepare(`SELECT * FROM ${this.table} WHERE status = ?`).all(filter.status)
        : this.db.prepare(`SELECT * FROM ${this.table}`).all()
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
