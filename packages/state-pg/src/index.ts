import type { HumanResult } from "@hitl-sdk/hitl";
import type {
  BatchRecord,
  HumanRequestRecord,
  NewBatchRecord,
  NewHumanRequestRecord,
  NewNotifyDeliveryRecord,
  NotifyDeliveryRecord,
  State,
  TimelineEntry,
} from "@hitl-sdk/hitl/state";
import type { HumanActions } from "@hitl-sdk/hitl/state";
import { normalizeActions } from "@hitl-sdk/hitl/state";
import { applyMigrations, type PgQueryable } from "./migrate.js";
import { schemaSql as buildSchemaSql } from "./schema-sql.js";
import { DEFAULT_TABLE, resolveTableName } from "./table.js";

export type { PgQueryable } from "./migrate.js";
export { DEFAULT_TABLE } from "./table.js";
export { SCHEMA_VERSION } from "./migrations/index.js";
export { migrationSql } from "./schema-sql.js";

export interface PostgresStateOptions {
  /** Defaults to `hitl.human_requests`. */
  tableName?: string;
}

export function schemaSql(tableName = DEFAULT_TABLE): string {
  return buildSchemaSql(tableName);
}

interface HumanRequestRow {
  id: string;
  token: string;
  channel: string;
  message: string;
  fields: Record<string, unknown>;
  actions: HumanActions | null;
  context: Record<string, unknown> | null;
  status: string;
  external_id: string | null;
  external_ids: Record<string, string> | null;
  result: HumanResult | null;
  created_at: string;
  resolved_at: string | null;
  batch_id: string | null;
  batch_index: number | null;
}

interface BatchRow {
  id: string;
  channel: string;
  message: string | null;
  actions: HumanActions | null;
  context: Record<string, unknown> | null;
  external_id: string | null;
  external_ids: Record<string, string> | null;
  created_at: string;
}

interface TimelineRow {
  id: string;
  thread_id: string;
  message: string;
  detail: Record<string, unknown> | null;
  created_at: string;
}

interface NotifyDeliveryRow {
  id: string;
  channel: string;
  message: string;
  group_id: string;
  external_id: string | null;
  created_at: string;
}

export class PostgresState implements State {
  private readonly pool: PgQueryable;
  private readonly table: ReturnType<typeof resolveTableName>;
  private readonly tableName: string;

  constructor(pool: PgQueryable, options?: PostgresStateOptions) {
    this.pool = pool;
    this.tableName = options?.tableName ?? DEFAULT_TABLE;
    this.table = resolveTableName(this.tableName);
  }

  async ensureSchema(): Promise<void> {
    await applyMigrations(this.pool, this.tableName);
  }

  async create(record: NewHumanRequestRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO ${this.table.sql}
         (id, token, channel, message, fields, actions, context, status, created_at, batch_id, batch_index)
       VALUES ($1, $2, $3, $4, '{}'::jsonb, $5::jsonb, $6::jsonb, 'pending', $7, $8, $9)`,
      [
        record.id,
        record.token,
        record.channel,
        record.message,
        JSON.stringify(record.actions),
        record.context === undefined ? null : JSON.stringify(record.context),
        new Date().toISOString(),
        record.batchId ?? null,
        record.batchIndex ?? null,
      ],
    );
  }

  async get(id: string): Promise<HumanRequestRecord | null> {
    const { rows } = await this.pool.query(`SELECT * FROM ${this.table.sql} WHERE id = $1`, [id]);
    const row = rows[0] as HumanRequestRow | undefined;
    return row ? rowToRecord(row) : null;
  }

  async findByExternalId(externalId: string): Promise<HumanRequestRecord | null> {
    const { rows } = await this.pool.query(
      `SELECT * FROM ${this.table.sql} WHERE external_id = $1`,
      [externalId],
    );
    if (rows[0]) return rowToRecord(rows[0] as HumanRequestRow);

    const { rows: withExtras } = await this.pool.query(
      `SELECT * FROM ${this.table.sql} WHERE external_ids != '{}'::jsonb`,
    );
    for (const row of withExtras as HumanRequestRow[]) {
      const record = rowToRecord(row);
      if (record.externalIds && Object.values(record.externalIds).includes(externalId)) {
        return record;
      }
    }
    return null;
  }

  async findByToken(token: string): Promise<HumanRequestRecord | null> {
    const { rows } = await this.pool.query(`SELECT * FROM ${this.table.sql} WHERE token = $1`, [
      token,
    ]);
    return rows[0] ? rowToRecord(rows[0] as HumanRequestRow) : null;
  }

  async setExternalId(id: string, externalId: string, pluginId?: string): Promise<void> {
    const record = await this.get(id);
    if (!record) throw new Error(`Unknown human request "${id}"`);

    const key = pluginId ?? record.channel;
    const externalIds = { ...record.externalIds, [key]: externalId };
    const primaryExternalId = key === record.channel ? externalId : record.externalId;

    const { rowCount } = await this.pool.query(
      `UPDATE ${this.table.sql}
       SET external_id = $2, external_ids = $3::jsonb
       WHERE id = $1`,
      [id, primaryExternalId ?? null, JSON.stringify(externalIds)],
    );
    if (!rowCount) throw new Error(`Unknown human request "${id}"`);
  }

  async resolve(id: string, result: HumanResult): Promise<void> {
    const { rowCount } = await this.pool.query(
      `UPDATE ${this.table.sql} SET status = 'resolved', result = $2::jsonb, resolved_at = $3
       WHERE id = $1 AND status = 'pending'`,
      [id, JSON.stringify(result), new Date().toISOString()],
    );
    if (!rowCount) {
      const record = await this.get(id);
      if (record) throw new Error(`Human request "${id}" is already resolved`);
      throw new Error(`Unknown human request "${id}"`);
    }
  }

  async list(filter?: { status?: HumanRequestRecord["status"] }): Promise<HumanRequestRecord[]> {
    const { rows } = filter?.status
      ? await this.pool.query(`SELECT * FROM ${this.table.sql} WHERE status = $1`, [filter.status])
      : await this.pool.query(`SELECT * FROM ${this.table.sql}`);
    return (rows as HumanRequestRow[]).map(rowToRecord);
  }

  async createBatch(record: NewBatchRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO ${this.table.batchesSql} (id, channel, message, actions, context, created_at)
       VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6)`,
      [
        record.id,
        record.channel,
        record.message ?? null,
        record.actions === undefined ? null : JSON.stringify(record.actions),
        record.context === undefined ? null : JSON.stringify(record.context),
        new Date().toISOString(),
      ],
    );
  }

  async getBatch(id: string): Promise<BatchRecord | null> {
    const { rows } = await this.pool.query(
      `SELECT * FROM ${this.table.batchesSql} WHERE id = $1`,
      [id],
    );
    return rows[0] ? batchRowToRecord(rows[0] as BatchRow) : null;
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

  async listByBatch(batchId: string): Promise<HumanRequestRecord[]> {
    const { rows } = await this.pool.query(
      `SELECT * FROM ${this.table.sql} WHERE batch_id = $1 ORDER BY batch_index`,
      [batchId],
    );
    return (rows as HumanRequestRow[]).map(rowToRecord);
  }

  async appendTimeline(entry: TimelineEntry): Promise<void> {
    await this.pool.query(
      `INSERT INTO ${this.table.timelineSql} (id, thread_id, message, detail, created_at)
       VALUES ($1, $2, $3, $4::jsonb, $5)`,
      [
        entry.id,
        entry.threadId,
        entry.message,
        entry.detail === undefined ? null : JSON.stringify(entry.detail),
        entry.createdAt,
      ],
    );
  }

  async timeline(threadId: string): Promise<TimelineEntry[]> {
    const { rows } = await this.pool.query(
      `SELECT * FROM ${this.table.timelineSql} WHERE thread_id = $1 ORDER BY created_at`,
      [threadId],
    );
    return (rows as TimelineRow[]).map(timelineRowToEntry);
  }

  async createNotifyDelivery(record: NewNotifyDeliveryRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO ${this.table.notifyDeliveriesSql}
         (id, channel, message, group_id, created_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [record.id, record.channel, record.message, record.groupId, new Date().toISOString()],
    );
  }

  async getNotifyDelivery(id: string): Promise<NotifyDeliveryRecord | null> {
    const { rows } = await this.pool.query(
      `SELECT * FROM ${this.table.notifyDeliveriesSql} WHERE id = $1`,
      [id],
    );
    const row = rows[0] as NotifyDeliveryRow | undefined;
    return row ? notifyDeliveryRowToRecord(row) : null;
  }

  async setNotifyDeliveryExternalId(id: string, externalId: string): Promise<void> {
    const { rowCount } = await this.pool.query(
      `UPDATE ${this.table.notifyDeliveriesSql} SET external_id = $2 WHERE id = $1`,
      [id, externalId],
    );
    if (!rowCount) throw new Error(`Unknown notify delivery "${id}"`);
  }
}

function rowToRecord(row: HumanRequestRow): HumanRequestRecord {
  const actions = normalizeActions(row.actions, row.fields);
  return {
    id: row.id,
    token: row.token,
    channel: row.channel,
    message: row.message,
    actions,
    context: row.context ?? undefined,
    status: row.status as HumanRequestRecord["status"],
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
    message: row.message ?? undefined,
    actions: row.actions ? normalizeActions(row.actions) : undefined,
    context: row.context ?? undefined,
    externalId: row.external_id ?? undefined,
    externalIds:
      row.external_ids && Object.keys(row.external_ids).length > 0
        ? row.external_ids
        : undefined,
    createdAt: row.created_at,
  };
}

function timelineRowToEntry(row: TimelineRow): TimelineEntry {
  return {
    id: row.id,
    threadId: row.thread_id,
    message: row.message,
    detail: row.detail ?? undefined,
    createdAt: row.created_at,
  };
}

function notifyDeliveryRowToRecord(row: NotifyDeliveryRow): NotifyDeliveryRecord {
  return {
    id: row.id,
    channel: row.channel,
    message: row.message,
    groupId: row.group_id,
    externalId: row.external_id ?? undefined,
    createdAt: row.created_at,
  };
}
