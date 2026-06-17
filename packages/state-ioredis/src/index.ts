import type Redis from "ioredis";
import type { HumanResult } from "@hitl-sdk/hitl";
import type {
  BatchRecord,
  HumanRequestRecord,
  InboxCountOptions,
  InboxListOptions,
  InboxListResult,
  NewBatchRecord,
  NewHumanRequestRecord,
  NewNotifyDeliveryRecord,
  NotifyDeliveryRecord,
  State,
  TimelineEntry,
} from "@hitl-sdk/hitl/state";
import { buildInboxPage, clampInboxLimit, decodeInboxCursor } from "@hitl-sdk/hitl/state";
import { applyMigrations } from "./migrate.js";
import { DEFAULT_PREFIX, DEFAULT_TABLE, resolveKeyPrefix, type ResolvedKeyPrefix } from "./keys.js";
import { SCHEMA_VERSION } from "./migrations/index.js";
import { resolveAtomic, resolveError } from "./resolve.js";
import {
  externalIdKeys,
  newBatch,
  newHumanRequest,
  newNotifyDelivery,
  parseBatch,
  parseHumanRequest,
  parseNotifyDelivery,
  parseTimelineEntry,
  timelineScore,
  type StoredBatch,
  type StoredHumanRequest,
  type StoredNotifyDelivery,
  type StoredTimelineEntry,
} from "./serialize.js";

export { DEFAULT_PREFIX, DEFAULT_TABLE } from "./keys.js";
export { SCHEMA_VERSION } from "./migrations/index.js";

export interface IoredisStateOptions {
  /** Defaults to `hitl.human_requests` (Redis prefix `hitl:human_requests`). */
  tableName?: string;
}

export class IoredisState implements State {
  private readonly redis: Redis;
  private readonly keys: ResolvedKeyPrefix;
  private readonly tableName: string;
  private initPromise: Promise<void> | null = null;

  constructor(redis: Redis, options?: IoredisStateOptions) {
    this.redis = redis;
    this.tableName = options?.tableName ?? DEFAULT_TABLE;
    this.keys = resolveKeyPrefix(this.tableName);
  }

  async ensureSchema(): Promise<void> {
    await applyMigrations(this.redis, this.tableName);
  }

  private async ready(): Promise<void> {
    this.initPromise ??= this.ensureSchema();
    await this.initPromise;
  }

  async create(record: NewHumanRequestRecord): Promise<void> {
    await this.ready();
    const createdAt = new Date().toISOString();
    const stored = newHumanRequest(record, createdAt);
    const score = timelineScore(createdAt);
    const pipeline = this.redis.pipeline();
    pipeline.set(this.keys.req(record.id), JSON.stringify(stored));
    pipeline.set(this.keys.idxToken(record.token), record.id);
    pipeline.zadd(this.keys.idxStatus("pending"), score, record.id);
    pipeline.zadd(this.keys.idxAllReq(), score, record.id);
    pipeline.zadd(this.keys.idxNs(record.namespace), score, record.id);
    pipeline.zadd(this.keys.idxNsStatus(record.namespace, "pending"), score, record.id);
    if (record.batchId !== undefined && record.batchIndex !== undefined) {
      pipeline.zadd(this.keys.idxBatchItems(record.batchId), record.batchIndex, record.id);
    }
    await pipeline.exec();
  }

  async get(id: string): Promise<HumanRequestRecord | null> {
    await this.ready();
    const raw = await this.redis.get(this.keys.req(id));
    return raw ? parseHumanRequest(raw) : null;
  }

  async findByExternalId(externalId: string): Promise<HumanRequestRecord | null> {
    await this.ready();
    const id = await this.redis.get(this.keys.idxExt(externalId));
    if (!id) return null;
    return this.get(id);
  }

  async findByToken(token: string): Promise<HumanRequestRecord | null> {
    await this.ready();
    const id = await this.redis.get(this.keys.idxToken(token));
    if (!id) return null;
    return this.get(id);
  }

  async setExternalId(id: string, externalId: string, pluginId?: string): Promise<void> {
    await this.ready();
    const record = await this.get(id);
    if (!record) throw new Error(`Unknown human request "${id}"`);

    const key = pluginId ?? record.channel;
    const externalIds = { ...record.externalIds, [key]: externalId };
    const primaryExternalId = key === record.channel ? externalId : record.externalId;

    const previousKeys = externalIdKeys(record.externalIds, record.externalId);
    const nextKeys = externalIdKeys(externalIds, primaryExternalId);

    const stored: StoredHumanRequest = {
      ...record,
      externalId: primaryExternalId,
      externalIds,
    };

    const pipeline = this.redis.pipeline();
    pipeline.set(this.keys.req(id), JSON.stringify(stored));
    for (const value of nextKeys) {
      if (!previousKeys.includes(value)) {
        pipeline.set(this.keys.idxExt(value), id);
      }
    }
    await pipeline.exec();
  }

  async resolve(id: string, result: HumanResult): Promise<void> {
    await this.ready();
    const outcome = await resolveAtomic(this.redis, this.keys, id, result);
    if (outcome !== "ok") {
      throw resolveError(id, outcome);
    }
  }

  /** Pick the ZSET that answers a list/count filter: namespace and/or status scoped. */
  private indexFor(filter?: { status?: "pending" | "resolved"; namespace?: string }): string {
    if (filter?.namespace) {
      return filter.status
        ? this.keys.idxNsStatus(filter.namespace, filter.status)
        : this.keys.idxNs(filter.namespace);
    }
    return filter?.status ? this.keys.idxStatus(filter.status) : this.keys.idxAllReq();
  }

  async list(filter?: InboxListOptions): Promise<InboxListResult> {
    await this.ready();
    const limit = clampInboxLimit(filter?.limit);
    const indexKey = this.indexFor(filter);

    const cursor = filter?.cursor ? decodeInboxCursor(filter.cursor) : null;
    const cursorScore = cursor ? timelineScore(cursor.createdAt) : null;
    const max = cursorScore === null ? "+inf" : String(cursorScore);

    // Pull ids newest-first (score desc, then member desc within a score),
    // skipping anything at-or-before the cursor, until we have limit+1.
    const want = limit + 1;
    const ids: string[] = [];
    const window = Math.max(want, 64);
    let offset = 0;
    for (;;) {
      const rows = await this.redis.zrevrangebyscore(
        indexKey,
        max,
        "-inf",
        "WITHSCORES",
        "LIMIT",
        offset,
        window,
      );
      if (rows.length === 0) break;
      for (let i = 0; i < rows.length; i += 2) {
        const id = rows[i]!;
        const score = Number(rows[i + 1]!);
        if (cursor && !isAfterCursor(score, id, cursorScore!, cursor.id)) continue;
        ids.push(id);
        if (ids.length >= want) break;
      }
      if (ids.length >= want || rows.length / 2 < window) break;
      offset += window;
    }
    if (ids.length === 0) return { items: [] };

    const values = await this.redis.mget(...ids.map((id) => this.keys.req(id)));
    const records: HumanRequestRecord[] = [];
    for (const raw of values) {
      if (raw) records.push(parseHumanRequest(raw));
    }
    return buildInboxPage(records, limit);
  }

  async count(filter?: InboxCountOptions): Promise<number> {
    await this.ready();
    return this.redis.zcard(this.indexFor(filter));
  }

  async createBatch(record: NewBatchRecord): Promise<void> {
    await this.ready();
    const stored = newBatch(record, new Date().toISOString());
    await this.redis.set(this.keys.batch(record.id), JSON.stringify(stored));
  }

  async getBatch(id: string): Promise<BatchRecord | null> {
    await this.ready();
    const raw = await this.redis.get(this.keys.batch(id));
    return raw ? parseBatch(raw) : null;
  }

  async setBatchExternalId(id: string, externalId: string, pluginId?: string): Promise<void> {
    await this.ready();
    const raw = await this.redis.get(this.keys.batch(id));
    if (!raw) throw new Error(`Unknown batch "${id}"`);

    const batch = parseBatch(raw);
    const key = pluginId ?? batch.channel;
    const externalIds = { ...batch.externalIds, [key]: externalId };
    const primaryExternalId = key === batch.channel ? externalId : batch.externalId;

    const previousKeys = externalIdKeys(batch.externalIds, batch.externalId);
    const nextKeys = externalIdKeys(externalIds, primaryExternalId);

    const stored: StoredBatch = {
      id: batch.id,
      channel: batch.channel,
      message: batch.message,
      actions: batch.actions,
      context: batch.context,
      externalId: primaryExternalId,
      externalIds,
      createdAt: batch.createdAt,
    };

    const pipeline = this.redis.pipeline();
    pipeline.set(this.keys.batch(id), JSON.stringify(stored));
    for (const value of nextKeys) {
      if (!previousKeys.includes(value)) {
        pipeline.set(this.keys.idxBatchExt(value), id);
      }
    }
    await pipeline.exec();
  }

  async listByBatch(batchId: string): Promise<HumanRequestRecord[]> {
    await this.ready();
    const ids = await this.redis.zrange(this.keys.idxBatchItems(batchId), 0, -1);
    if (ids.length === 0) return [];

    const values = await this.redis.mget(...ids.map((id) => this.keys.req(id)));
    const records: HumanRequestRecord[] = [];
    for (const raw of values) {
      if (raw) records.push(parseHumanRequest(raw));
    }
    return records;
  }

  async appendTimeline(entry: TimelineEntry): Promise<void> {
    await this.ready();
    const stored: StoredTimelineEntry = {
      id: entry.id,
      threadId: entry.threadId,
      message: entry.message,
      detail: entry.detail,
      createdAt: entry.createdAt,
    };
    const pipeline = this.redis.pipeline();
    pipeline.set(this.keys.timelineEntry(entry.id), JSON.stringify(stored));
    pipeline.zadd(this.keys.timelineThread(entry.threadId), timelineScore(entry.createdAt), entry.id);
    await pipeline.exec();
  }

  async timeline(threadId: string): Promise<TimelineEntry[]> {
    await this.ready();
    const ids = await this.redis.zrange(this.keys.timelineThread(threadId), 0, -1);
    if (ids.length === 0) return [];

    const values = await this.redis.mget(...ids.map((id) => this.keys.timelineEntry(id)));
    const entries: TimelineEntry[] = [];
    for (const raw of values) {
      if (raw) entries.push(parseTimelineEntry(raw));
    }
    return entries;
  }

  async createNotifyDelivery(record: NewNotifyDeliveryRecord): Promise<void> {
    await this.ready();
    const stored = newNotifyDelivery(record, new Date().toISOString());
    await this.redis.set(this.keys.notify(record.id), JSON.stringify(stored));
  }

  async getNotifyDelivery(id: string): Promise<NotifyDeliveryRecord | null> {
    await this.ready();
    const raw = await this.redis.get(this.keys.notify(id));
    return raw ? parseNotifyDelivery(raw) : null;
  }

  async setNotifyDeliveryExternalId(id: string, externalId: string): Promise<void> {
    await this.ready();
    const raw = await this.redis.get(this.keys.notify(id));
    if (!raw) throw new Error(`Unknown notify delivery "${id}"`);

    const record = parseNotifyDelivery(raw);
    const stored: StoredNotifyDelivery = {
      id: record.id,
      channel: record.channel,
      message: record.message,
      groupId: record.groupId,
      externalId,
      createdAt: record.createdAt,
    };

    const pipeline = this.redis.pipeline();
    pipeline.set(this.keys.notify(id), JSON.stringify(stored));
    if (record.externalId !== externalId) {
      pipeline.set(this.keys.idxNotifyExt(externalId), id);
    }
    await pipeline.exec();
  }
}

/** True when `(score, id)` sorts strictly after the cursor in `(createdAt desc, id desc)` order. */
function isAfterCursor(score: number, id: string, cursorScore: number, cursorId: string): boolean {
  if (score !== cursorScore) return score < cursorScore;
  return id < cursorId;
}
