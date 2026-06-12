import { getRuntime } from "./create-hitl";
import { notifyVia, requestApproval, type ApprovalOptions } from "./core";
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

/** Fire-and-forget progress updates and threaded context. */
export async function notify(notification: Notification): Promise<void> {
  return notifyVia(getRuntime(), notification);
}

export { hitl } from "./fields";
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
export { notifyVia, requestApproval } from "./core";
export type { HitlRuntime } from "./core";

export { webui } from "./webui";
export type { WebuiOptions } from "./webui";

export type { ApprovalOptions } from "./core";
export type {
  ApprovalRequest,
  ApprovalResult,
  HitlCallback,
  HitlPlugin,
  Notification,
  Reviewer,
} from "./types";

export { InMemoryApprovalStore } from "./store";
export type { ApprovalRecord, ApprovalStore, NewApprovalRecord } from "./store";

export type { EngineBinding, EngineSuspension } from "./binding";
export type { Duration } from "./duration";
export { FeedbackValidationError, validateFeedbacks } from "./validate";
