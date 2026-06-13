import type { HumanResult } from "hitl";
import type {
  BatchRecord,
  HumanRequestRecord,
  NewBatchRecord,
  NewHumanRequestRecord,
  NewNotifyDeliveryRecord,
  NotifyDeliveryRecord,
} from "hitl/state";
import type { HumanActions } from "hitl/state";
import { normalizeActions } from "hitl/state";
import type { TimelineEntry } from "hitl/state";

export interface StoredHumanRequest {
  id: string;
  token: string;
  channel: string;
  message: string;
  actions: HumanActions;
  context?: Record<string, unknown>;
  status: HumanRequestRecord["status"];
  externalId?: string;
  externalIds?: Record<string, string>;
  result?: HumanResult;
  createdAt: string;
  resolvedAt?: string;
  batchId?: string;
  batchIndex?: number;
}

export interface StoredBatch {
  id: string;
  channel: string;
  message?: string;
  actions?: HumanActions;
  context?: Record<string, unknown>;
  externalId?: string;
  externalIds?: Record<string, string>;
  createdAt: string;
}

export interface StoredTimelineEntry {
  id: string;
  threadId: string;
  message: string;
  detail?: Record<string, unknown>;
  createdAt: string;
}

export interface StoredNotifyDelivery {
  id: string;
  channel: string;
  message: string;
  groupId: string;
  externalId?: string;
  createdAt: string;
}

export function newHumanRequest(record: NewHumanRequestRecord, createdAt: string): StoredHumanRequest {
  return {
    id: record.id,
    token: record.token,
    channel: record.channel,
    message: record.message,
    actions: record.actions,
    context: record.context,
    status: "pending",
    createdAt,
    batchId: record.batchId,
    batchIndex: record.batchIndex,
  };
}

export function newBatch(record: NewBatchRecord, createdAt: string): StoredBatch {
  return {
    id: record.id,
    channel: record.channel,
    message: record.message,
    actions: record.actions,
    context: record.context,
    createdAt,
  };
}

export function newNotifyDelivery(
  record: NewNotifyDeliveryRecord,
  createdAt: string,
): StoredNotifyDelivery {
  return {
    id: record.id,
    channel: record.channel,
    message: record.message,
    groupId: record.groupId,
    createdAt,
  };
}

export function parseHumanRequest(raw: string): HumanRequestRecord {
  const stored = JSON.parse(raw) as StoredHumanRequest;
  return {
    id: stored.id,
    token: stored.token,
    channel: stored.channel,
    message: stored.message,
    actions: normalizeActions(stored.actions),
    context: stored.context,
    status: stored.status,
    externalId: stored.externalId,
    externalIds:
      stored.externalIds && Object.keys(stored.externalIds).length > 0
        ? stored.externalIds
        : undefined,
    result: stored.result,
    createdAt: stored.createdAt,
    resolvedAt: stored.resolvedAt,
    batchId: stored.batchId,
    batchIndex: stored.batchIndex,
  };
}

export function parseBatch(raw: string): BatchRecord {
  const stored = JSON.parse(raw) as StoredBatch;
  return {
    id: stored.id,
    channel: stored.channel,
    message: stored.message,
    actions: stored.actions === undefined ? undefined : normalizeActions(stored.actions),
    context: stored.context,
    externalId: stored.externalId,
    externalIds:
      stored.externalIds && Object.keys(stored.externalIds).length > 0
        ? stored.externalIds
        : undefined,
    createdAt: stored.createdAt,
  };
}

export function parseTimelineEntry(raw: string): TimelineEntry {
  const stored = JSON.parse(raw) as StoredTimelineEntry;
  return {
    id: stored.id,
    threadId: stored.threadId,
    message: stored.message,
    detail: stored.detail,
    createdAt: stored.createdAt,
  };
}

export function parseNotifyDelivery(raw: string): NotifyDeliveryRecord {
  const stored = JSON.parse(raw) as StoredNotifyDelivery;
  return {
    id: stored.id,
    channel: stored.channel,
    message: stored.message,
    groupId: stored.groupId,
    externalId: stored.externalId,
    createdAt: stored.createdAt,
  };
}

export function timelineScore(createdAt: string): number {
  return Date.parse(createdAt);
}

export function externalIdKeys(
  externalIds: Record<string, string> | undefined,
  externalId: string | undefined,
): string[] {
  const values = new Set<string>();
  if (externalId) values.add(externalId);
  if (externalIds) {
    for (const value of Object.values(externalIds)) {
      values.add(value);
    }
  }
  return [...values];
}
