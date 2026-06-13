import type { HitlField } from "./fields";
import type { ApprovalResult, Notification } from "./types";

/**
 * Wire types of the internal `.well-known/hitldev/v1` API: the workflow-side
 * client POSTs these bodies; the server handles them with the core services.
 * Resume tokens travel in the body, never in the URL.
 */

export interface CreateRequestBody {
  /** Opaque engine resume token from `suspend()`; also the idempotency key. */
  token: string;
  message: string;
  fields: Record<string, HitlField>;
  /** Plugin id; defaults to the first configured plugin. */
  channel?: string;
}

export interface CreateRequestResponse {
  id: string;
}

export interface CreateBatchItemBody {
  /** Opaque engine resume token for this item's suspension. */
  token: string;
  message: string;
  /** Shared field schema with this item's defaults merged in. */
  fields: Record<string, HitlField>;
}

export interface CreateBatchBody {
  title?: string;
  /** Plugin id; defaults to the first configured plugin. */
  channel?: string;
  /** Field schema shared by every item; drives the batch UI. */
  fields: Record<string, HitlField>;
  items: CreateBatchItemBody[];
}

export interface CreateBatchResponse {
  batchId: string;
  /** Item ids in input order. */
  ids: string[];
}

/**
 * Reminder/escalation trigger. The workflow side owns the schedule (durable
 * timers); the server only acts if the subject is still pending.
 */
export type RemindBody =
  | { kind: "remind"; message?: string }
  | { kind: "escalate"; channel: string; message?: string; mode?: "notify" | "redeliver" };

export interface RemindResponse {
  pending: boolean;
}

export interface TimeoutResponse {
  result: ApprovalResult;
}

export interface BatchTimeoutResponse {
  /** Item order: pending items as TIMED_OUT, resolved items keep their stored result. */
  results: ApprovalResult[];
}

export type NotifyBody = Notification;
