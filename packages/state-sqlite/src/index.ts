import type { DatabaseSync } from "node:sqlite";
import type {
  ApprovalRecord,
  ApprovalResult,
  BatchRecord,
  NewApprovalRecord,
  NewBatchRecord,
  Store,
} from "hitl";
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
  external_ids: string;
  result: string | null;
  created_at: string;
  resolved_at: string | null;
  batch_id: string | null;
  batch_index: number | null;
}

interface BatchRow {
  id: string;
  channel: string;
  title: string | null;
  external_id: string | null;
  external_ids: string;
  created_at: string;
}

/**
 * `Store` backed by `node:sqlite`. The schema is created automatically in the
 * constructor (synchronous and idempotent) — unlike `@hitl/state-pg`,
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
        `INSERT INTO ${this.table.sql}
           (id, token, channel, message, fields, status, created_at, batch_id, batch_index)
         VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
      )
      .run(
        record.id,
        record.token,
        record.channel,
        record.message,
        JSON.stringify(record.fields),
        new Date().toISOString(),
        record.batchId ?? null,
        record.batchIndex ?? null,
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
    if (row) return rowToRecord(row);

    const rows = this.db.prepare(`SELECT * FROM ${this.table.sql}`).all() as unknown as ApprovalRow[];
    for (const candidate of rows) {
      const externalIds = parseExternalIds(candidate.external_ids);
      if (Object.values(externalIds).includes(externalId)) {
        return rowToRecord(candidate);
      }
    }
    return null;
  }

  async findByToken(token: string): Promise<ApprovalRecord | null> {
    const row = this.db.prepare(`SELECT * FROM ${this.table.sql} WHERE token = ?`).get(token) as
      | ApprovalRow
      | undefined;
    return row ? rowToRecord(row) : null;
  }

  async setExternalId(id: string, externalId: string, pluginId?: string): Promise<void> {
    const record = await this.get(id);
    if (!record) throw new Error(`Unknown approval "${id}"`);

    const key = pluginId ?? record.channel;
    const externalIds = { ...record.externalIds, [key]: externalId };
    const primaryExternalId = key === record.channel ? externalId : record.externalId;

    const { changes } = this.db
      .prepare(`UPDATE ${this.table.sql} SET external_id = ?, external_ids = ? WHERE id = ?`)
      .run(primaryExternalId ?? null, JSON.stringify(externalIds), id);
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

  async createBatch(record: NewBatchRecord): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO ${this.table.batchesSql} (id, channel, title, created_at)
         VALUES (?, ?, ?, ?)`,
      )
      .run(record.id, record.channel, record.title ?? null, new Date().toISOString());
  }

  async getBatch(id: string): Promise<BatchRecord | null> {
    const row = this.db.prepare(`SELECT * FROM ${this.table.batchesSql} WHERE id = ?`).get(id) as
      | BatchRow
      | undefined;
    return row ? batchRowToRecord(row) : null;
  }

  async setBatchExternalId(id: string, externalId: string, pluginId?: string): Promise<void> {
    const batch = await this.getBatch(id);
    if (!batch) throw new Error(`Unknown batch "${id}"`);

    const key = pluginId ?? batch.channel;
    const externalIds = { ...batch.externalIds, [key]: externalId };
    const primaryExternalId = key === batch.channel ? externalId : batch.externalId;

    this.db
      .prepare(`UPDATE ${this.table.batchesSql} SET external_id = ?, external_ids = ? WHERE id = ?`)
      .run(primaryExternalId ?? null, JSON.stringify(externalIds), id);
  }

  async listByBatch(batchId: string): Promise<ApprovalRecord[]> {
    const rows = this.db
      .prepare(`SELECT * FROM ${this.table.sql} WHERE batch_id = ? ORDER BY batch_index`)
      .all(batchId) as unknown as ApprovalRow[];
    return rows.map(rowToRecord);
  }
}

function parseExternalIds(raw: string | undefined): Record<string, string> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
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
    externalIds: (() => {
      const ids = parseExternalIds(row.external_ids);
      return Object.keys(ids).length > 0 ? ids : undefined;
    })(),
    result: row.result === null ? undefined : JSON.parse(row.result),
    createdAt: row.created_at,
    resolvedAt: row.resolved_at ?? undefined,
    batchId: row.batch_id ?? undefined,
    batchIndex: row.batch_index ?? undefined,
  };
}

function batchRowToRecord(row: BatchRow): BatchRecord {
  return {
    id: row.id,
    channel: row.channel,
    title: row.title ?? undefined,
    externalId: row.external_id ?? undefined,
    externalIds: (() => {
      const ids = parseExternalIds(row.external_ids);
      return Object.keys(ids).length > 0 ? ids : undefined;
    })(),
    createdAt: row.created_at,
  };
}
