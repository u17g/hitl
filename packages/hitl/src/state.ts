import type { HitlField } from "./fields";
import type { HumanActions } from "./human-actions";
import type { HumanResult } from "./human-result";
import type { TimelineEntry } from "./timeline";

export interface NewHumanRequestRecord {
  id: string;
  /** Opaque engine resume token (WDK hook token, Temporal signal, ...). */
  token: string;
  channel: string;
  message: string;
  actions: HumanActions;
  context?: Record<string, unknown>;
  /** Set when the request is one item of a `waitForHuman` batch call. */
  batchId?: string;
  /** Zero-based position within the batch; orders `listByBatch`. */
  batchIndex?: number;
}

export interface NewBatchRecord {
  id: string;
  channel: string;
  message?: string;
  actions?: HumanActions;
  context?: Record<string, unknown>;
}

/** Groups the items of one `waitForHuman` batch call; status derives from its items. */
export interface BatchRecord extends NewBatchRecord {
  /** Channel message id of the batch message, set after `adapter.sendBatch`. */
  externalId?: string;
  /** Per-adapter delivery ids (e.g. escalation re-deliveries). */
  externalIds?: Record<string, string>;
  createdAt: string;
}

export interface NotifyDeliveryRecord {
  id: string;
  channel: string;
  message: string;
  /** Parent thread group for timeline; human/batch/notify id. */
  groupId: string;
  /** Adapter opaque ref after post; undefined for inbox no-op. */
  externalId?: string;
  createdAt: string;
}

export interface NewNotifyDeliveryRecord {
  id: string;
  channel: string;
  message: string;
  groupId: string;
}

export interface HumanRequestRecord extends NewHumanRequestRecord {
  status: "pending" | "resolved";
  /** Channel message id (e.g. Slack message ts), set after `adapter.send`. */
  externalId?: string;
  /** Per-adapter delivery ids (e.g. escalation re-deliveries). */
  externalIds?: Record<string, string>;
  result?: HumanResult;
  createdAt: string;
  resolvedAt?: string;
}

/** Filter and page controls for `State.list` / `inbox.list`. */
export interface InboxListOptions {
  status?: HumanRequestRecord["status"];
  /** Page size; clamped to [1, {@link MAX_INBOX_LIMIT}], default {@link DEFAULT_INBOX_LIMIT}. */
  limit?: number;
  /** Opaque cursor from a previous page's `nextCursor`; pages newest-first. */
  cursor?: string;
}

/** Filter for `State.count` / `inbox.count`. */
export interface InboxCountOptions {
  status?: HumanRequestRecord["status"];
}

/** One page of inbox records, newest-first. */
export interface InboxListResult {
  items: HumanRequestRecord[];
  /** Cursor for the next (older) page; absent on the last page. */
  nextCursor?: string;
}

export const DEFAULT_INBOX_LIMIT = 50;
export const MAX_INBOX_LIMIT = 10_000;

/** Default to {@link DEFAULT_INBOX_LIMIT}; clamp anything else to [1, {@link MAX_INBOX_LIMIT}]. */
export function clampInboxLimit(limit?: number): number {
  if (limit === undefined || !Number.isFinite(limit) || limit < 1) return DEFAULT_INBOX_LIMIT;
  return Math.min(Math.floor(limit), MAX_INBOX_LIMIT);
}

/** Opaque page cursor over `(createdAt, id)`. Inverse of {@link decodeInboxCursor}. */
export function encodeInboxCursor(createdAt: string, id: string): string {
  return Buffer.from(`${createdAt}|${id}`, "utf8").toString("base64url");
}

export function decodeInboxCursor(cursor: string): { createdAt: string; id: string } {
  const decoded = Buffer.from(cursor, "base64url").toString("utf8");
  const sep = decoded.indexOf("|");
  if (sep === -1) throw new Error(`Invalid inbox cursor "${cursor}"`);
  return { createdAt: decoded.slice(0, sep), id: decoded.slice(sep + 1) };
}

/**
 * Build a page from rows already ordered newest-first and over-fetched by one
 * (i.e. `limit + 1`). The extra row signals (and seeds) the next page.
 */
export function buildInboxPage(rows: HumanRequestRecord[], limit: number): InboxListResult {
  if (rows.length <= limit) return { items: rows };
  const items = rows.slice(0, limit);
  const last = items[items.length - 1]!;
  return { items, nextCursor: encodeInboxCursor(last.createdAt, last.id) };
}

/** Newest-first order: `createdAt` desc, then `id` desc as a stable tiebreaker. */
function compareRecordsDesc(a: HumanRequestRecord, b: HumanRequestRecord): number {
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
  if (a.id !== b.id) return a.id < b.id ? 1 : -1;
  return 0;
}

/** True when `r` sorts strictly after the cursor position (i.e. belongs to a later page). */
function isBeforeCursor(r: HumanRequestRecord, cur: { createdAt: string; id: string }): boolean {
  if (r.createdAt !== cur.createdAt) return r.createdAt < cur.createdAt;
  return r.id < cur.id;
}

/** Persistence for pending/resolved human requests; powers the inbox and audit. */
export interface State {
  create(record: NewHumanRequestRecord): Promise<void>;
  get(id: string): Promise<HumanRequestRecord | null>;
  findByExternalId(externalId: string): Promise<HumanRequestRecord | null>;
  /** Look up by resume token; powers idempotent request creation over at-least-once delivery. */
  findByToken(token: string): Promise<HumanRequestRecord | null>;
  setExternalId(id: string, externalId: string, pluginId?: string): Promise<void>;
  resolve(id: string, result: HumanResult): Promise<void>;
  /** Pending/resolved records, newest-first, one page at a time. */
  list(filter?: InboxListOptions): Promise<InboxListResult>;
  /** Total number of pending/resolved records; filter by status. */
  count(filter?: InboxCountOptions): Promise<number>;
  createBatch(record: NewBatchRecord): Promise<void>;
  getBatch(id: string): Promise<BatchRecord | null>;
  setBatchExternalId(id: string, externalId: string, pluginId?: string): Promise<void>;
  /** Items of a batch, ordered by `batchIndex`. */
  listByBatch(batchId: string): Promise<HumanRequestRecord[]>;
  appendTimeline(entry: TimelineEntry): Promise<void>;
  timeline(threadId: string): Promise<TimelineEntry[]>;
  createNotifyDelivery(record: NewNotifyDeliveryRecord): Promise<void>;
  getNotifyDelivery(id: string): Promise<NotifyDeliveryRecord | null>;
  setNotifyDeliveryExternalId(id: string, externalId: string): Promise<void>;
}

export class InMemoryState implements State {
  private records = new Map<string, HumanRequestRecord>();
  private batches = new Map<string, BatchRecord>();
  private timelines = new Map<string, TimelineEntry[]>();
  private notifyDeliveries = new Map<string, NotifyDeliveryRecord>();

  async create(record: NewHumanRequestRecord): Promise<void> {
    this.records.set(record.id, {
      ...record,
      status: "pending",
      createdAt: new Date().toISOString(),
    });
  }

  async get(id: string): Promise<HumanRequestRecord | null> {
    return this.records.get(id) ?? null;
  }

  async findByExternalId(externalId: string): Promise<HumanRequestRecord | null> {
    for (const record of this.records.values()) {
      if (record.externalId === externalId) return record;
      if (record.externalIds) {
        for (const value of Object.values(record.externalIds)) {
          if (value === externalId) return record;
        }
      }
    }
    return null;
  }

  async findByToken(token: string): Promise<HumanRequestRecord | null> {
    for (const record of this.records.values()) {
      if (record.token === token) return record;
    }
    return null;
  }

  async setExternalId(id: string, externalId: string, pluginId?: string): Promise<void> {
    const record = this.mustGet(id);
    const key = pluginId ?? record.channel;
    record.externalIds = { ...record.externalIds, [key]: externalId };
    if (key === record.channel) {
      record.externalId = externalId;
    }
  }

  async resolve(id: string, result: HumanResult): Promise<void> {
    const record = this.mustGet(id);
    if (record.status === "resolved") {
      throw new Error(`Human request "${id}" is already resolved`);
    }
    record.status = "resolved";
    record.result = result;
    record.resolvedAt = new Date().toISOString();
  }

  async list(filter?: InboxListOptions): Promise<InboxListResult> {
    const limit = clampInboxLimit(filter?.limit);
    let all = [...this.records.values()];
    if (filter?.status) all = all.filter((r) => r.status === filter.status);
    all.sort(compareRecordsDesc);
    if (filter?.cursor) {
      const cur = decodeInboxCursor(filter.cursor);
      all = all.filter((r) => isBeforeCursor(r, cur));
    }
    return buildInboxPage(all.slice(0, limit + 1), limit);
  }

  async count(filter?: InboxCountOptions): Promise<number> {
    if (!filter?.status) return this.records.size;
    let n = 0;
    for (const r of this.records.values()) if (r.status === filter.status) n++;
    return n;
  }

  async createBatch(record: NewBatchRecord): Promise<void> {
    this.batches.set(record.id, {
      ...record,
      createdAt: new Date().toISOString(),
    });
  }

  async getBatch(id: string): Promise<BatchRecord | null> {
    return this.batches.get(id) ?? null;
  }

  async setBatchExternalId(id: string, externalId: string, pluginId?: string): Promise<void> {
    const batch = this.batches.get(id);
    if (!batch) throw new Error(`Unknown batch "${id}"`);
    const key = pluginId ?? batch.channel;
    batch.externalIds = { ...batch.externalIds, [key]: externalId };
    if (key === batch.channel) {
      batch.externalId = externalId;
    }
  }

  async listByBatch(batchId: string): Promise<HumanRequestRecord[]> {
    return [...this.records.values()]
      .filter((r) => r.batchId === batchId)
      .sort((a, b) => (a.batchIndex ?? 0) - (b.batchIndex ?? 0));
  }

  async appendTimeline(entry: TimelineEntry): Promise<void> {
    const list = this.timelines.get(entry.threadId) ?? [];
    list.push(entry);
    this.timelines.set(entry.threadId, list);
  }

  async timeline(threadId: string): Promise<TimelineEntry[]> {
    return this.timelines.get(threadId) ?? [];
  }

  async createNotifyDelivery(record: NewNotifyDeliveryRecord): Promise<void> {
    this.notifyDeliveries.set(record.id, {
      ...record,
      createdAt: new Date().toISOString(),
    });
  }

  async getNotifyDelivery(id: string): Promise<NotifyDeliveryRecord | null> {
    return this.notifyDeliveries.get(id) ?? null;
  }

  async setNotifyDeliveryExternalId(id: string, externalId: string): Promise<void> {
    const record = this.notifyDeliveries.get(id);
    if (!record) throw new Error(`Unknown notify delivery "${id}"`);
    record.externalId = externalId;
  }

  private mustGet(id: string): HumanRequestRecord {
    const record = this.records.get(id);
    if (!record) throw new Error(`Unknown human request "${id}"`);
    return record;
  }
}

const processStateKey = Symbol.for("hitl.inMemoryState");

/** Default when `new Hitl()` gets no state: one in-memory state per process. */
export function defaultInMemoryState(): InMemoryState {
  const g = globalThis as Record<symbol, InMemoryState | undefined>;
  g[processStateKey] ??= new InMemoryState();
  return g[processStateKey]!;
}
