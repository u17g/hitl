import type { HitlField } from "./fields";
import type { HumanActions } from "./human-actions";
import type { HumanResult } from "./human-result";

export interface Reviewer {
  id?: string;
  name?: string;
  email?: string;
}

export type { HumanResult };

/** Chain timeline placement across notify / waitForHuman. */
export interface TimelineAnchor {
  id: string;
  /** Adapter-native ref for the delivered message. Empty when the adapter did not return one. */
  externalRef: string;
}

/**
 * What an adapter receives to render and deliver a human step.
 * Not to be confused with `HitlRequest` in `binding.ts`, which is the durable
 * step HTTP envelope (`url`, `method`, `body`) sent to the hitl server.
 */
export interface HumanRequest {
  id: string;
  /** Adapter id (routing key prefix). */
  channel: string;
  /** Opaque destination within the adapter; undefined = adapter defaultChannel. */
  destination?: string;
  message: string;
  actions: HumanActions;
  context?: Record<string, unknown>;
}

/**
 * What an adapter receives to render and deliver a batch as a single message.
 * The action schema is shared across items; each item carries its resolved initial values.
 */
export interface BatchHumanRequest {
  batchId: string;
  /** Adapter id (routing key prefix). */
  channel: string;
  /** Opaque destination within the adapter; undefined = adapter defaultChannel. */
  destination?: string;
  message?: string;
  actions: HumanActions;
  /** Input order. `defaults` are submit field defaults overridden per item. */
  items: Array<{ id: string; message: string; defaults: Record<string, unknown> }>;
  context?: Record<string, unknown>;
}

export interface Notification {
  message: string;
  /** Reply under the same chat thread as a prior human step or notify. */
  after?: { id: string };
  /** HITL request or batch id when `after` is unavailable (e.g. while pending). */
  on?: string;
  detail?: Record<string, unknown>;
  /** Adapter id or `adapter_id:destination` routing key. */
  channel?: string;
  /** Opaque destination within the adapter; set by the core from the routing key. */
  destination?: string;
}

/**
 * A parsed inbound interaction resolved through `hitl.inbox.resolve`.
 * Feedback values are raw; the core validates and types them.
 */
export interface HitlCallback {
  requestId: string;
  actionId: string;
  by?: Reviewer;
  /** Raw edited values validated against the chosen action's fields. */
  feedbacks?: Record<string, unknown>;
  /** Channel-specific ack to return to the caller (e.g. Slack expects a fast 200). */
  response?: Response;
  /** When true, return response immediately without resolving a human request. */
  ackOnly?: boolean;
}

/**
 * A parsed inbound batch interaction: one submit carrying a decision for every
 * item of a batch. Returned by a channel's parse helper; resolve via `hitl.inbox`.
 */
export interface HitlBatchCallback {
  batchId: string;
  decisions: Array<{
    requestId: string;
    actionId: string;
    feedbacks?: Record<string, unknown>;
  }>;
  by?: Reviewer;
  /** Channel-specific ack to return to the caller (e.g. Slack expects a fast 200). */
  response?: Response;
  /** When true, return response immediately without resolving the batch. */
  ackOnly?: boolean;
}

export interface HitlAdapter {
  /** Routing key used by `waitForHuman({ channel })` / `notify({ channel })`. */
  id: string;
  /**
   * HTTP jurisdiction key under `/.well-known/hitl/v1/channels/{channelKey}/`.
   * Omit when the adapter has no channel HTTP routes.
   */
  channelKey?: string;
  /**
   * Handle requests under this adapter's channel prefix.
   * Called only after `channelKey` matches the request path.
   */
  fetch?(req: Request): Promise<Response>;
  /** Default destination when the routing key is adapter id only. Adapter-specific format. */
  defaultChannel?: string;
  /** Render and deliver a human step request. */
  send(request: HumanRequest): Promise<{ externalId: string }>;
  /** Reflect resolution back into the channel (e.g. replace buttons with "Approved by @ryosuke"). */
  update?(externalId: string, result: HumanResult): Promise<void>;
  notify(notification: Notification): Promise<{ externalId?: string }>;
  /** Render and deliver a batch as a single message. Absent → the core sends items one by one. */
  sendBatch?(request: BatchHumanRequest): Promise<{ externalId: string }>;
  /**
   * Whether this request fits the channel's batch UI (size limits, field
   * support). `false` → the core falls back to per-item delivery.
   */
  canSendBatch?(request: BatchHumanRequest): boolean;
  /** Reflect batch resolution back into the channel. `results` is in item order. */
  updateBatch?(externalId: string, results: HumanResult[]): Promise<void>;
}
