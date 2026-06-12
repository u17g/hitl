import type { DatabaseSync } from "node:sqlite";
import type { ApprovalRecord, ApprovalResult, NewApprovalRecord, Store } from "@hitldev/sdk";

export interface SqliteStoreOptions {
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
  private readonly table: ResolvedTable;

  constructor(database: DatabaseSync, options?: SqliteStoreOptions) {
    this.db = database;
    this.table = resolveTableName(options?.tableName ?? DEFAULT_TABLE);
    this.ensureSchema();
  }

  /** Idempotent; already run by the constructor. */
  ensureSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ${this.table.sql} (
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
      CREATE INDEX IF NOT EXISTS ${this.table.indexName}
        ON ${this.table.sql} (external_id);
    `);
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
    const quoted = `"${schema}.${table}"`;
    return {
      sql: quoted,
      indexName: `${schema}_${table}_external_id_idx`,
    };
  }
  assertIdentifier(tableName);
  return {
    sql: tableName,
    indexName: `${tableName}_external_id_idx`,
  };
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
    fields: JSON.parse(row.fields),
    status: row.status as ApprovalRecord["status"],
    externalId: row.external_id ?? undefined,
    result: row.result === null ? undefined : JSON.parse(row.result),
    createdAt: row.created_at,
    resolvedAt: row.resolved_at ?? undefined,
  };
}
