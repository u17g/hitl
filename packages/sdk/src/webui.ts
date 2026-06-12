import type { HitlBatchCallback, HitlCallback, HitlPlugin, Reviewer } from "./types";

export interface WebuiOptions {
  /** Plugin id and URL segment. Defaults to "webui". */
  id?: string;
}

interface WebuiCallbackBody {
  decision: "approve" | "deny";
  feedbacks?: Record<string, unknown>;
  reason?: string;
  by?: Reviewer;
}

interface WebuiBatchCallbackBody {
  decisions: HitlBatchCallback["decisions"];
  by?: Reviewer;
}

/**
 * The built-in web inbox plugin. Local dev works with zero external services:
 * pending approvals come from the inbox API (`GET /approvals`), resolutions
 * arrive as `POST <base>/<id>/approvals/:requestId`, batch submits as
 * `POST <base>/<id>/batches/:batchId`.
 */
export function webui(options?: WebuiOptions): HitlPlugin {
  const id = options?.id ?? "webui";

  return {
    id,

    // Nothing to deliver: the inbox polls the approval store.
    async send(request) {
      return { externalId: request.id };
    },

    async sendBatch(request) {
      return { externalId: request.batchId };
    },

    async notify() {},

    async handleCallback(req): Promise<HitlCallback | HitlBatchCallback | null> {
      if (req.method !== "POST") return null;

      const segments = new URL(req.url).pathname.split("/").filter(Boolean);
      const pluginIndex = segments.indexOf(id);
      if (pluginIndex === -1) return null;

      if (segments[pluginIndex + 1] === "batches") {
        const batchId = segments[pluginIndex + 2];
        if (!batchId) return null;
        const body = (await req.json()) as WebuiBatchCallbackBody;
        return { batchId, decisions: body.decisions, by: body.by };
      }

      if (segments[pluginIndex + 1] !== "approvals") return null;
      const requestId = segments[pluginIndex + 2];
      if (!requestId) return null;

      const body = (await req.json()) as WebuiCallbackBody;
      return {
        requestId,
        decision: body.decision,
        feedbacks: body.feedbacks,
        reason: body.reason,
        by: body.by,
      };
    },
  };
}
