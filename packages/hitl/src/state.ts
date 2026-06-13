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

/** Persistence for pending/resolved human requests; powers the inbox and audit. */
export interface State {
  create(record: NewHumanRequestRecord): Promise<void>;
  get(id: string): Promise<HumanRequestRecord | null>;
  findByExternalId(externalId: string): Promise<HumanRequestRecord | null>;
  /** Look up by resume token; powers idempotent request creation over at-least-once delivery. */
  findByToken(token: string): Promise<HumanRequestRecord | null>;
  setExternalId(id: string, externalId: string, pluginId?: string): Promise<void>;
  resolve(id: string, result: HumanResult): Promise<void>;
  list(filter?: { status?: HumanRequestRecord["status"] }): Promise<HumanRequestRecord[]>;
  createBatch(record: NewBatchRecord): Promise<void>;
  getBatch(id: string): Promise<BatchRecord | null>;
  setBatchExternalId(id: string, externalId: string, pluginId?: string): Promise<void>;
  /** Items of a batch, ordered by `batchIndex`. */
  listByBatch(batchId: string): Promise<HumanRequestRecord[]>;
  appendTimeline(entry: TimelineEntry): Promise<void>;
  timeline(threadId: string): Promise<TimelineEntry[]>;
}

export class InMemoryState implements State {
  private records = new Map<string, HumanRequestRecord>();
  private batches = new Map<string, BatchRecord>();
  private timelines = new Map<string, TimelineEntry[]>();

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

  async list(filter?: { status?: HumanRequestRecord["status"] }): Promise<HumanRequestRecord[]> {
    const all = [...this.records.values()];
    if (!filter?.status) return all;
    return all.filter((r) => r.status === filter.status);
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
