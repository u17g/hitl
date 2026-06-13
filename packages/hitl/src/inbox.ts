import { resolveApproval, resolveBatchApproval, type HitlRuntime } from "./core";
import type { ApprovalRecord, BatchRecord } from "./state";
import type { ApprovalResult, HitlBatchCallback, Reviewer } from "./types";

/** One reviewer decision in a batch submit. Same shape as `HitlBatchCallback["decisions"][number]`. */
export interface BatchDecision {
  requestId: string;
  decision: "approve" | "deny";
  reason?: string;
  feedbacks?: Record<string, unknown>;
}

/**
 * Programmatic inbox API: read approval state and resolve approvals from your
 * own server code. `createHitl(...)` exposes one as `hitl.inbox` — build your
 * own HTTP handlers (or wire the Chat SDK bot) on top of these methods.
 */
export interface HitlInbox {
  /** Pending and resolved approvals, newest-first; filter by status. */
  list(filter?: { status?: ApprovalRecord["status"] }): Promise<ApprovalRecord[]>;
  /** A single approval, or null when the id is unknown. */
  get(id: string): Promise<ApprovalRecord | null>;
  /** A batch with its items in input order, or null when the id is unknown. */
  getBatch(batchId: string): Promise<{ batch: BatchRecord; items: ApprovalRecord[] } | null>;
  /** Approve an approval. Edited `feedbacks` turn the result into REVIEWED. */
  approve(
    id: string,
    opts?: { feedbacks?: Record<string, unknown>; by?: Reviewer },
  ): Promise<ApprovalResult>;
  /** Deny an approval with an optional reason. */
  deny(id: string, opts?: { reason?: string; by?: Reviewer }): Promise<ApprovalResult>;
  /** Resolve every item of a batch in one submit; results come back in item order. */
  submitBatch(
    batchId: string,
    decisions: BatchDecision[],
    opts?: { by?: Reviewer },
  ): Promise<ApprovalResult[]>;
}

/**
 * Build the inbox facade over a runtime. Reads forward to the state; writes go
 * through the core resolvers, which validate feedbacks, resume the engine, and
 * reflect the outcome back into the channel. Errors (unknown id, invalid
 * feedbacks) propagate unchanged for the caller to map.
 */
export function createInbox(runtime: HitlRuntime): HitlInbox {
  const { state } = runtime;
  return {
    list: (filter) => state.list(filter),

    get: (id) => state.get(id),

    async getBatch(batchId) {
      const batch = await state.getBatch(batchId);
      if (!batch) return null;
      return { batch, items: await state.listByBatch(batchId) };
    },

    approve(id, opts) {
      return resolveApproval(runtime, {
        requestId: id,
        decision: "approve",
        feedbacks: opts?.feedbacks,
        by: opts?.by,
      });
    },

    deny(id, opts) {
      return resolveApproval(runtime, {
        requestId: id,
        decision: "deny",
        reason: opts?.reason,
        by: opts?.by,
      });
    },

    submitBatch(batchId, decisions, opts) {
      const callback: HitlBatchCallback = { batchId, decisions, by: opts?.by };
      return resolveBatchApproval(runtime, callback);
    },
  };
}
