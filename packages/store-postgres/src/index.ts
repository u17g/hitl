import type {
  ApprovalRecord,
  ApprovalResult,
  BatchRecord,
  NewApprovalRecord,
  NewBatchRecord,
  Store,
} from "hitl";
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
  external_ids: Record<string, string> | null;
  result: ApprovalResult | null;
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
  external_ids: Record<string, string> | null;
  created_at: string;
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
      `INSERT INTO ${this.table.sql}
         (id, token, channel, message, fields, status, created_at, batch_id, batch_index)
       VALUES ($1, $2, $3, $4, $5::jsonb, 'pending', $6, $7, $8)`,
      [
        record.id,
        record.token,
        record.channel,
        record.message,
        JSON.stringify(record.fields),
        new Date().toISOString(),
        record.batchId ?? null,
        record.batchIndex ?? null,
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
    if (rows[0]) return rowToRecord(rows[0]);

    const { rows: withExtras } = await this.pool.query(
      `SELECT * FROM ${this.table.sql} WHERE external_ids != '{}'::jsonb`,
    );
    for (const row of withExtras) {
      const record = rowToRecord(row);
      if (record.externalIds && Object.values(record.externalIds).includes(externalId)) {
        return record;
      }
    }
    return null;
  }

  async findByToken(token: string): Promise<ApprovalRecord | null> {
    const { rows } = await this.pool.query(`SELECT * FROM ${this.table.sql} WHERE token = $1`, [
      token,
    ]);
    return rows[0] ? rowToRecord(rows[0]) : null;
  }

  async setExternalId(id: string, externalId: string, pluginId?: string): Promise<void> {
    const record = await this.get(id);
    if (!record) throw new Error(`Unknown approval "${id}"`);

    const key = pluginId ?? record.channel;
    const externalIds = { ...record.externalIds, [key]: externalId };
    const primaryExternalId = key === record.channel ? externalId : record.externalId;

    const { rowCount } = await this.pool.query(
      `UPDATE ${this.table.sql}
       SET external_id = $2, external_ids = $3::jsonb
       WHERE id = $1`,
      [id, primaryExternalId ?? null, JSON.stringify(externalIds)],
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

  async createBatch(record: NewBatchRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO ${this.table.batchesSql} (id, channel, title, created_at)
       VALUES ($1, $2, $3, $4)`,
      [record.id, record.channel, record.title ?? null, new Date().toISOString()],
    );
  }

  async getBatch(id: string): Promise<BatchRecord | null> {
    const { rows } = await this.pool.query(
      `SELECT * FROM ${this.table.batchesSql} WHERE id = $1`,
      [id],
    );
    return rows[0] ? batchRowToRecord(rows[0]) : null;
  }

  async setBatchExternalId(id: string, externalId: string, pluginId?: string): Promise<void> {
    const batch = await this.getBatch(id);
    if (!batch) throw new Error(`Unknown batch "${id}"`);

    const key = pluginId ?? batch.channel;
    const externalIds = { ...batch.externalIds, [key]: externalId };
    const primaryExternalId = key === batch.channel ? externalId : batch.externalId;

    await this.pool.query(
      `UPDATE ${this.table.batchesSql}
       SET external_id = $2, external_ids = $3::jsonb
       WHERE id = $1`,
      [id, primaryExternalId ?? null, JSON.stringify(externalIds)],
    );
  }

  async listByBatch(batchId: string): Promise<ApprovalRecord[]> {
    const { rows } = await this.pool.query(
      `SELECT * FROM ${this.table.sql} WHERE batch_id = $1 ORDER BY batch_index`,
      [batchId],
    );
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
    externalIds:
      row.external_ids && Object.keys(row.external_ids).length > 0
        ? row.external_ids
        : undefined,
    result: row.result ?? undefined,
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
    externalIds:
      row.external_ids && Object.keys(row.external_ids).length > 0
        ? row.external_ids
        : undefined,
    createdAt: row.created_at,
  };
}
