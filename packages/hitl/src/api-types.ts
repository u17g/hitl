import type { HumanActions } from "./human-actions";
import type { HumanResult, Notification } from "./types";

/**
 * Wire types of the internal `.well-known/hitl/v1` API: the workflow-side
 * client POSTs these bodies; the server handles them with the core services.
 * Resume tokens travel in the body, never in the URL.
 */

export interface CreateRequestBody {
  /** Opaque engine resume token from `suspend()`; also the idempotency key. */
  token: string;
  message: string;
  actions: HumanActions;
  context?: Record<string, unknown>;
  /** Adapter id or `adapter_id:destination`; defaults to the first configured adapter. */
  channel?: string;
  /** Post under the same chat thread as a prior human step or notify. */
  after?: { id: string };
}

export interface CreateRequestResponse {
  id: string;
  externalRef: string;
}

export interface CreateBatchItemBody {
  /** Opaque engine resume token for this item's suspension. */
  token: string;
  message: string;
  /** Per-item overrides for submit field defaults. */
  defaults?: Record<string, unknown>;
}

export interface CreateBatchBody {
  message?: string;
  /** Adapter id or `adapter_id:destination`; defaults to the first configured adapter. */
  channel?: string;
  actions: HumanActions;
  context?: Record<string, unknown>;
  /** Target action for per-item defaults when no submit action exists. */
  defaultsActionId?: string;
  items: CreateBatchItemBody[];
  /** Post under the same chat thread as a prior human step or notify. */
  after?: { id: string };
}

export interface CreateBatchResponse {
  batchId: string;
  /** Item ids in input order. */
  ids: string[];
  externalRef: string;
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
  result: HumanResult;
}

export interface BatchTimeoutResponse {
  /** Item order: pending items as TIMED_OUT, resolved items keep their stored result. */
  results: HumanResult[];
}

export type NotifyBody = Notification;

export interface NotifyResponse {
  id: string;
  externalRef: string;
}
