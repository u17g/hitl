import { resolveHumanRequest, resolveBatchHumanRequest, type HitlRuntime } from "./core";
import type { HumanRequestRecord, BatchRecord } from "./state";
import type { HumanResult, HitlBatchCallback, Reviewer } from "./types";

/** One reviewer decision in a batch resolve. */
export interface BatchDecision {
  requestId: string;
  actionId: string;
  feedbacks?: Record<string, unknown>;
}

/**
 * Programmatic inbox API: read human request state and resolve requests from your
 * own server code. `new Hitl(...)` exposes one as `hitl.inbox` — build your
 * own HTTP handlers (or wire the Chat SDK bot) on top of these methods.
 */
export interface HitlInbox {
  /** Pending and resolved human requests, newest-first; filter by status. */
  list(filter?: { status?: HumanRequestRecord["status"] }): Promise<HumanRequestRecord[]>;
  /** A single human request, or null when the id is unknown. */
  get(id: string): Promise<HumanRequestRecord | null>;
  /** A batch with its items in input order, or null when the id is unknown. */
  getBatch(batchId: string): Promise<{ batch: BatchRecord; items: HumanRequestRecord[] } | null>;
  /** Resolve a human request with the chosen action. */
  resolve(
    id: string,
    opts: { actionId: string; feedbacks?: Record<string, unknown>; by?: Reviewer },
  ): Promise<HumanResult>;
  /** Resolve every item of a batch in one call; results come back in item order. */
  resolveBatch(
    batchId: string,
    decisions: BatchDecision[],
    opts?: { by?: Reviewer },
  ): Promise<HumanResult[]>;
}

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

    resolve(id, opts) {
      return resolveHumanRequest(runtime, {
        requestId: id,
        actionId: opts.actionId,
        feedbacks: opts.feedbacks,
        by: opts.by,
      });
    },

    resolveBatch(batchId, decisions, opts) {
      const callback: HitlBatchCallback = {
        batchId,
        decisions: decisions.map((d) => ({
          requestId: d.requestId,
          actionId: d.actionId,
          feedbacks: d.feedbacks,
        })),
        by: opts?.by,
      };
      return resolveBatchHumanRequest(runtime, callback);
    },
  };
}
