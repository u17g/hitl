import type {
  ApprovalRequest,
  ApprovalResult,
  HitlInbox,
  HitlPlugin,
  Notification,
} from "hitl";
import type { Chat, SentMessage } from "chat";
import { registerHitlHandlers } from "./actions";
import { encodeExternalId, threadRef } from "./external-id";
import { approvalCard, resultCard } from "./render";

export interface ChatHitlOptions {
  /** Plugin id, the routing key used by `waitForApproval({ channel })`. */
  id: string;
  /** The shared Chat SDK instance that owns the webhooks and handler registry. */
  bot: Chat;
  /** Chat SDK channel ref to post approvals into, e.g. "slack:C123". */
  channel: string;
  /**
   * The hitldev inbox, resolved lazily. `createHitl` needs the plugins before
   * the inbox exists, so pass `() => hitl.inbox`; the handlers call it per event.
   */
  inbox: () => HitlInbox;
}

/**
 * A hitldev channel plugin backed by the Vercel Chat SDK. One adapter delivers
 * approvals to Slack, Teams, Discord and every other Chat SDK platform, with the
 * SDK owning webhook verification, payload parsing, and native card rendering.
 *
 * Feedback fields are collected through a modal opened on the approve click
 * (Chat SDK cards cannot hold inline text inputs). Batches have no dedicated UI
 * here — without `sendBatch`, the core delivers each item on its own, so every
 * item goes through the same card + modal flow.
 */
export function chatHitl(options: ChatHitlOptions): HitlPlugin {
  const { bot, channel } = options;
  // update() receives only the externalId, but Chat SDK edits need the original
  // SentMessage handle — keep it (and the message text the result card reuses)
  // in memory. A process restart loses the map; update then no-ops, matching the
  // existing platform plugins.
  const sent = new Map<string, { handle: SentMessage; message: string }>();

  registerHitlHandlers(bot, options.inbox);

  return {
    id: options.id,

    async send(request: ApprovalRequest): Promise<{ externalId: string }> {
      const handle = await bot.channel(channel).post(approvalCard(request));
      const externalId = encodeExternalId(channel, handle.id);
      sent.set(externalId, { handle, message: request.message });
      return { externalId };
    },

    async update(externalId: string, result: ApprovalResult): Promise<void> {
      const entry = sent.get(externalId);
      if (!entry) return;
      await entry.handle.edit(resultCard(entry.message, result));
      sent.delete(externalId);
    },

    async notify(notification: Notification): Promise<void> {
      if (notification.parentExternalId) {
        await bot.thread(threadRef(notification.parentExternalId)).post(notification.message);
        return;
      }
      await bot.channel(channel).post(notification.message);
    },
  };
}
