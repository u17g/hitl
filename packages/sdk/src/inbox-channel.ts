import type { HitlPlugin } from "./types";

/** Channel id of the always-on web inbox. */
export const INBOX_CHANNEL_ID = "inbox";

/**
 * The built-in web inbox channel. Always present — `createHitl` includes it
 * automatically, so it is never passed in `plugins`. Delivery is a no-op: there
 * is no external service to post to; the inbox reads pending approvals from the
 * store (`hitl.inbox` / `GET /approvals`) and resolutions arrive through the
 * built-in write routes (`POST <base>/approvals/:id`,
 * `POST <base>/batches/:batchId`) or `hitl.inbox.approve/deny/submitBatch`
 * directly. Local dev works with zero external services.
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
