import type { HitlField } from "./fields";

export interface Reviewer {
  id?: string;
  name?: string;
  email?: string;
}

/** Discriminated union returned by `waitForApproval`. `F` is inferred from the field definitions. */
export type ApprovalResult<F = Record<string, unknown>> =
  | { type: "APPROVED"; id: string; by?: Reviewer }
  | { type: "DENIED"; id: string; by?: Reviewer; reason?: string }
  | { type: "REVIEWED"; id: string; by?: Reviewer; feedbacks: F }
  | { type: "TIMED_OUT"; id: string };

/** What a plugin receives to render and deliver an approval request. */
export interface ApprovalRequest {
  id: string;
  channel: string;
  message: string;
  fields: Record<string, HitlField>;
}

/**
 * What a plugin receives to render and deliver a batch of approvals as a
 * single message. The field schema is shared across items; each item carries
 * its resolved initial values.
 */
export interface BatchApprovalRequest {
  batchId: string;
  channel: string;
  title?: string;
  /** Field schema shared by every item. */
  fields: Record<string, HitlField>;
  /** Input order. `defaults` are the shared field defaults overridden per item. */
  items: Array<{ id: string; message: string; defaults: Record<string, unknown> }>;
}

export interface Notification {
  message: string;
  /** Approval id to thread under. */
  parent?: string;
  /** Channel message id of the parent approval (e.g. Slack thread_ts), resolved by the core. */
  parentExternalId?: string;
  channel?: string;
}

/**
 * Parsed inbound interaction, returned by `plugin.handleCallback`.
 * Feedback values are raw; the core validates and types them.
 */
export interface HitlCallback {
  requestId: string;
  decision: "approve" | "deny";
  by?: Reviewer;
  reason?: string;
  /** Raw edited values. Presence of edits turns an approval into a REVIEWED result. */
  feedbacks?: Record<string, unknown>;
  /** Channel-specific ack to return to the caller (e.g. Slack expects a fast 200). */
  response?: Response;
  /** When true, return response immediately without resolving an approval. */
  ackOnly?: boolean;
}

/**
 * Parsed inbound batch interaction: one submit carrying a decision for every
 * item of a batch. Returned by `plugin.handleCallback`.
 */
export interface HitlBatchCallback {
  batchId: string;
  decisions: Array<{
    requestId: string;
    decision: "approve" | "deny";
    reason?: string;
    /** Raw edited values. Presence of edits turns an approval into a REVIEWED result. */
    feedbacks?: Record<string, unknown>;
  }>;
  by?: Reviewer;
  /** Channel-specific ack to return to the caller (e.g. Slack expects a fast 200). */
  response?: Response;
  /** When true, return response immediately without resolving the batch. */
  ackOnly?: boolean;
}

export interface HitlPlugin {
  /** Routing key used by `waitForApproval({ channel })` / `notify({ channel })`. */
  id: string;
  /** Render and deliver an approval request. */
  send(request: ApprovalRequest): Promise<{ externalId: string }>;
  /** Reflect resolution back into the channel (e.g. replace buttons with "Approved by @ryosuke"). */
  update?(externalId: string, result: ApprovalResult): Promise<void>;
  notify(notification: Notification): Promise<void>;
  /** Parse an inbound interaction callback; return null if the request is not for this plugin. */
  handleCallback?(req: Request): Promise<HitlCallback | HitlBatchCallback | null>;
  /** Render and deliver a batch as a single message. Absent → the core sends items one by one. */
  sendBatch?(request: BatchApprovalRequest): Promise<{ externalId: string }>;
  /**
   * Whether this request fits the channel's batch UI (size limits, field
   * support). `false` → the core falls back to per-item delivery.
   */
  canSendBatch?(request: BatchApprovalRequest): boolean;
  /** Reflect batch resolution back into the channel. `results` is in item order. */
  updateBatch?(externalId: string, results: ApprovalResult[]): Promise<void>;
}
