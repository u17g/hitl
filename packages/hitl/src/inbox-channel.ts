import type { HitlAdapter } from "./types";

/** Channel id of the always-on web inbox. */
export const INBOX_CHANNEL_ID = "inbox";

/**
 * The built-in web inbox channel. Always present — `new Hitl()` includes it
 * automatically, so it is never passed in `adapters`. Delivery is a no-op: there
 * is no external service to post to; the inbox reads pending human requests from the
 * state via `hitl.inbox` and resolutions arrive through `hitl.inbox.resolve` or
 * `.resolveBatch` from your own handlers. Local dev works with zero external services.
 */
export function inboxChannel(): HitlAdapter {
  const id = INBOX_CHANNEL_ID;

  return {
    id,

    // Nothing to deliver: the inbox polls human request state.
    async send(request) {
      return { externalId: request.id };
    },

    async sendBatch(request) {
      return { externalId: request.batchId };
    },

    async notify() {
      return { externalId: undefined };
    },
  };
}
