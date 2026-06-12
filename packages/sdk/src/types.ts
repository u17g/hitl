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
  handleCallback?(req: Request): Promise<HitlCallback | null>;
}
