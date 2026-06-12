import type { HitlField } from "./fields";
import type { ApprovalResult } from "./types";

export interface NewApprovalRecord {
  id: string;
  /** Opaque engine resume token (WDK hook token, Temporal signal, ...). */
  token: string;
  channel: string;
  message: string;
  fields: Record<string, HitlField>;
}

export interface ApprovalRecord extends NewApprovalRecord {
  status: "pending" | "resolved";
  /** Channel message id (e.g. Slack message ts), set after `plugin.send`. */
  externalId?: string;
  /** Per-plugin delivery ids (e.g. escalation re-deliveries). */
  externalIds?: Record<string, string>;
  result?: ApprovalResult;
  createdAt: string;
  resolvedAt?: string;
}

/** Persistence for pending/resolved approvals; powers the inbox and audit. */
export interface Store {
  create(record: NewApprovalRecord): Promise<void>;
  get(id: string): Promise<ApprovalRecord | null>;
  findByExternalId(externalId: string): Promise<ApprovalRecord | null>;
  setExternalId(id: string, externalId: string, pluginId?: string): Promise<void>;
  resolve(id: string, result: ApprovalResult): Promise<void>;
  list(filter?: { status?: ApprovalRecord["status"] }): Promise<ApprovalRecord[]>;
}

export class InMemoryStore implements Store {
  private records = new Map<string, ApprovalRecord>();

  async create(record: NewApprovalRecord): Promise<void> {
    this.records.set(record.id, {
      ...record,
      status: "pending",
      createdAt: new Date().toISOString(),
    });
  }

  async get(id: string): Promise<ApprovalRecord | null> {
    return this.records.get(id) ?? null;
  }

  async findByExternalId(externalId: string): Promise<ApprovalRecord | null> {
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

  async setExternalId(id: string, externalId: string, pluginId?: string): Promise<void> {
    const record = this.mustGet(id);
    const key = pluginId ?? record.channel;
    record.externalIds = { ...record.externalIds, [key]: externalId };
    if (key === record.channel) {
      record.externalId = externalId;
    }
  }

  async resolve(id: string, result: ApprovalResult): Promise<void> {
    const record = this.mustGet(id);
    if (record.status === "resolved") {
      throw new Error(`Approval "${id}" is already resolved`);
    }
    record.status = "resolved";
    record.result = result;
    record.resolvedAt = new Date().toISOString();
  }

  async list(filter?: { status?: ApprovalRecord["status"] }): Promise<ApprovalRecord[]> {
    const all = [...this.records.values()];
    if (!filter?.status) return all;
    return all.filter((r) => r.status === filter.status);
  }

  private mustGet(id: string): ApprovalRecord {
    const record = this.records.get(id);
    if (!record) throw new Error(`Unknown approval "${id}"`);
    return record;
  }
}
