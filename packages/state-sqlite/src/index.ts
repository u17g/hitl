import type { DatabaseSync } from "node:sqlite";
import type {
  HumanRequestRecord,
  HumanResult,
  BatchRecord,
  NewHumanRequestRecord,
  NewBatchRecord,
  State,
  TimelineEntry,
} from "hitl";
import type { HumanActions } from "hitl";
import { normalizeActions } from "hitl";
import { applyMigrations } from "./migrate.js";
import { schemaSql as buildSchemaSql } from "./schema-sql.js";
import { DEFAULT_TABLE, resolveTableName } from "./table.js";

export { DEFAULT_TABLE } from "./table.js";
export { SCHEMA_VERSION } from "./migrations/index.js";
export { migrationSql } from "./schema-sql.js";

export interface SqliteStateOptions {
  /** Defaults to `hitl.human_requests`. */
  tableName?: string;
}

/** Idempotent DDL for the human requests table; also used by `ensureSchema()`. */
export function schemaSql(tableName = DEFAULT_TABLE): string {
  return buildSchemaSql(tableName);
}

interface HumanRequestRow {
  id: string;
  token: string;
  channel: string;
  message: string;
  fields: string;
  actions: string | null;
  context: string | null;
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
  message: string | null;
  actions: string | null;
  context: string | null;
  external_id: string | null;
  external_ids: string;
  created_at: string;
}

interface TimelineRow {
  id: string;
  thread_id: string;
  message: string;
  detail: string | null;
  created_at: string;
}

export class SqliteState implements State {
  private readonly db: DatabaseSync;
  private readonly tableName: string;
  private readonly table: ReturnType<typeof resolveTableName>;

  constructor(database: DatabaseSync, options?: SqliteStateOptions) {
    this.db = database;
    this.tableName = options?.tableName ?? DEFAULT_TABLE;
    this.table = resolveTableName(this.tableName);
    this.ensureSchema();
  }

  ensureSchema(): void {
    applyMigrations(this.db, this.tableName);
  }

  async create(record: NewHumanRequestRecord): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO ${this.table.sql}
           (id, token, channel, message, fields, actions, context, status, created_at, batch_id, batch_index)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
      )
      .run(
        record.id,
        record.token,
        record.channel,
        record.message,
        "{}",
        JSON.stringify(record.actions),
        record.context === undefined ? null : JSON.stringify(record.context),
        new Date().toISOString(),
        record.batchId ?? null,
        record.batchIndex ?? null,
      );
  }

  async get(id: string): Promise<HumanRequestRecord | null> {
    const row = this.db.prepare(`SELECT * FROM ${this.table.sql} WHERE id = ?`).get(id) as
      | HumanRequestRow
      | undefined;
    return row ? rowToRecord(row) : null;
  }

  async findByExternalId(externalId: string): Promise<HumanRequestRecord | null> {
    const row = this.db
      .prepare(`SELECT * FROM ${this.table.sql} WHERE external_id = ?`)
      .get(externalId) as HumanRequestRow | undefined;
    if (row) return rowToRecord(row);

    const rows = this.db.prepare(`SELECT * FROM ${this.table.sql}`).all() as unknown as HumanRequestRow[];
    for (const candidate of rows) {
      const externalIds = parseExternalIds(candidate.external_ids);
      if (Object.values(externalIds).includes(externalId)) {
        return rowToRecord(candidate);
      }
    }
    return null;
  }

  async findByToken(token: string): Promise<HumanRequestRecord | null> {
    const row = this.db.prepare(`SELECT * FROM ${this.table.sql} WHERE token = ?`).get(token) as
      | HumanRequestRow
      | undefined;
    return row ? rowToRecord(row) : null;
  }

  async setExternalId(id: string, externalId: string, pluginId?: string): Promise<void> {
    const record = await this.get(id);
    if (!record) throw new Error(`Unknown human request "${id}"`);

    const key = pluginId ?? record.channel;
    const externalIds = { ...record.externalIds, [key]: externalId };
    const primaryExternalId = key === record.channel ? externalId : record.externalId;

    const { changes } = this.db
      .prepare(`UPDATE ${this.table.sql} SET external_id = ?, external_ids = ? WHERE id = ?`)
      .run(primaryExternalId ?? null, JSON.stringify(externalIds), id);
    if (changes === 0) throw new Error(`Unknown human request "${id}"`);
  }

  async resolve(id: string, result: HumanResult): Promise<void> {
    const { changes } = this.db
      .prepare(
        `UPDATE ${this.table.sql} SET status = 'resolved', result = ?, resolved_at = ?
         WHERE id = ? AND status = 'pending'`,
      )
      .run(JSON.stringify(result), new Date().toISOString(), id);
    if (changes === 0) {
      const record = await this.get(id);
      if (record) throw new Error(`Human request "${id}" is already resolved`);
      throw new Error(`Unknown human request "${id}"`);
    }
  }

  async list(filter?: { status?: HumanRequestRecord["status"] }): Promise<HumanRequestRecord[]> {
    const rows = (
      filter?.status
        ? this.db.prepare(`SELECT * FROM ${this.table.sql} WHERE status = ?`).all(filter.status)
        : this.db.prepare(`SELECT * FROM ${this.table.sql}`).all()
    ) as unknown as HumanRequestRow[];
    return rows.map(rowToRecord);
  }

  async createBatch(record: NewBatchRecord): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO ${this.table.batchesSql} (id, channel, message, actions, context, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        record.id,
        record.channel,
        record.message ?? null,
        record.actions === undefined ? null : JSON.stringify(record.actions),
        record.context === undefined ? null : JSON.stringify(record.context),
        new Date().toISOString(),
      );
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

  async listByBatch(batchId: string): Promise<HumanRequestRecord[]> {
    const rows = this.db
      .prepare(`SELECT * FROM ${this.table.sql} WHERE batch_id = ? ORDER BY batch_index`)
      .all(batchId) as unknown as HumanRequestRow[];
    return rows.map(rowToRecord);
  }

  async appendTimeline(entry: TimelineEntry): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO ${this.table.timelineSql} (id, thread_id, message, detail, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(
        entry.id,
        entry.threadId,
        entry.message,
        entry.detail === undefined ? null : JSON.stringify(entry.detail),
        entry.createdAt,
      );
  }

  async timeline(threadId: string): Promise<TimelineEntry[]> {
    const rows = this.db
      .prepare(
        `SELECT * FROM ${this.table.timelineSql} WHERE thread_id = ? ORDER BY created_at`,
      )
      .all(threadId) as unknown as TimelineRow[];
    return rows.map(timelineRowToEntry);
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

function parseActions(row: HumanRequestRow): HumanActions {
  if (row.actions) {
    return normalizeActions(JSON.parse(row.actions));
  }
  const fields = JSON.parse(row.fields) as Record<string, unknown>;
  return normalizeActions(undefined, fields);
}

function rowToRecord(row: HumanRequestRow): HumanRequestRecord {
  return {
    id: row.id,
    token: row.token,
    channel: row.channel,
    message: row.message,
    actions: parseActions(row),
    context: row.context === null ? undefined : JSON.parse(row.context),
    status: row.status as HumanRequestRecord["status"],
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
    message: row.message ?? undefined,
    actions: row.actions === null ? undefined : normalizeActions(JSON.parse(row.actions)),
    context: row.context === null ? undefined : JSON.parse(row.context),
    externalId: row.external_id ?? undefined,
    externalIds: (() => {
      const ids = parseExternalIds(row.external_ids);
      return Object.keys(ids).length > 0 ? ids : undefined;
    })(),
    createdAt: row.created_at,
  };
}

function timelineRowToEntry(row: TimelineRow): TimelineEntry {
  return {
    id: row.id,
    threadId: row.thread_id,
    message: row.message,
    detail: row.detail === null ? undefined : JSON.parse(row.detail),
    createdAt: row.created_at,
  };
}
