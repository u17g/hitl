import type { HitlPlugin } from "./types";

/** Channel id of the always-on web inbox. */
export const INBOX_CHANNEL_ID = "inbox";

/**
 * The built-in web inbox channel. Always present — `createHitl` includes it
 * automatically, so it is never passed in `plugins`. Delivery is a no-op: there
 * is no external service to post to; the inbox reads pending approvals from the
 * store via `hitl.inbox` and resolutions arrive through `hitl.inbox.approve`,
 * `.deny`, or `.submitBatch` from your own handlers. Local dev works with zero
 * external services.
 */
export function inboxChannel(): HitlPlugin {
  const id = INBOX_CHANNEL_ID;

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
  };
}
