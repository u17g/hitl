import { getRuntime } from "./create-hitl";
import {
  notifyVia,
  requestApproval,
  requestBatchApprovals,
  type ApprovalOptions,
  type BatchApprovalOptions,
} from "./core";
import type { FeedbackValues, HitlField } from "./fields";
import type { ApprovalResult, Notification } from "./types";

/**
 * Suspend the workflow until a human responds — hours or days, surviving
 * restarts and deploys. Resolves with a typed `ApprovalResult`.
 */
export async function waitForApproval<F extends Record<string, HitlField>>(
  opts: ApprovalOptions<F>,
): Promise<ApprovalResult<FeedbackValues<F>>> {
  return requestApproval(getRuntime(), opts);
}

/**
 * Suspend the workflow until a human resolves a whole list of approvals,
 * delivered as a single message where the channel supports it. The field
 * schema is shared across items; each item can override the defaults.
 * Resolves with one `ApprovalResult` per item, in input order.
 */
export async function waitForBatchApprovals<F extends Record<string, HitlField>>(
  opts: BatchApprovalOptions<F>,
): Promise<ApprovalResult<FeedbackValues<F>>[]> {
  return requestBatchApprovals(getRuntime(), opts);
}

/** Fire-and-forget progress updates and threaded context. */
export async function notify(notification: Notification): Promise<void> {
  return notifyVia(getRuntime(), notification);
}

export { field } from "./fields";
export type {
  ConfirmField,
  FeedbackValues,
  HitlField,
  SelectField,
  TextAreaField,
  TextField,
} from "./fields";

export { createHitl, getRuntime } from "./create-hitl";
export type { CreateHitlOptions, HitlApp } from "./create-hitl";

// Building blocks for engine packages that ship their own workflow-side
// entrypoint (e.g. an Inngest `waitForApproval(step, opts)`).
export { notifyVia, requestApproval, requestBatchApprovals } from "./core";
export type { HitlRuntime } from "./core";

export { webui } from "./webui";
export type { WebuiOptions } from "./webui";

export type { ApprovalOptions, BatchApprovalItem, BatchApprovalOptions } from "./core";
export type {
  ApprovalRequest,
  ApprovalResult,
  BatchApprovalRequest,
  HitlBatchCallback,
  HitlCallback,
  HitlPlugin,
  Notification,
  Reviewer,
} from "./types";

export { InMemoryStore } from "./store";
export type {
  ApprovalRecord,
  BatchRecord,
  NewApprovalRecord,
  NewBatchRecord,
  Store,
} from "./store";

export type { EngineBinding, EngineSuspension } from "./binding";
export type { Duration } from "./duration";
export type { ReminderEntry, RemindEntry, EscalateEntry } from "./reminder";
export { FeedbackValidationError, validateFeedbacks } from "./validate";
