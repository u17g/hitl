import type {
  HumanRequest,
  HumanResult,
  HitlInbox,
  HitlAdapter,
  Notification,
} from "hitl";
import type { Chat, SentMessage } from "chat";
import { registerHitlHandlers } from "./actions";
import { encodeExternalId, toChatThreadRef } from "./external-id";
import { humanRequestCard, resultCard } from "./render";

export interface ChatHitlOptions {
  /** Adapter id, the routing key used by `waitForHuman({ channel })`. */
  id: string;
  /** The shared Chat SDK instance that owns the webhooks and handler registry. */
  bot: Chat;
  /** Chat SDK channel ref to post approvals into, e.g. "slack:C123". */
  channel: string;
  /**
   * The hitl inbox, resolved lazily. `new Hitl()` needs the adapters before
   * the inbox exists, so pass `() => hitl.inbox`; the handlers call it per event.
   */
  inbox: () => HitlInbox;
}

export function chatHitl(options: ChatHitlOptions): HitlAdapter {
  const { bot, channel } = options;
  const sent = new Map<string, { handle: SentMessage; message: string }>();

  registerHitlHandlers(bot, options.inbox);

  return {
    id: options.id,

    async send(request: HumanRequest): Promise<{ externalId: string }> {
      const target = request.threadRef
        ? bot.thread(toChatThreadRef(request.threadRef))
        : bot.channel(channel);
      const handle = await target.post(humanRequestCard(request));
      const externalId = encodeExternalId(channel, handle.id);
      sent.set(externalId, { handle, message: request.message });
      return { externalId };
    },

    async update(externalId: string, result: HumanResult): Promise<void> {
      const entry = sent.get(externalId);
      if (!entry) return;
      await entry.handle.edit(resultCard(entry.message, result));
      sent.delete(externalId);
    },

    async notify(notification: Notification): Promise<{ externalId?: string }> {
      if (notification.threadRef) {
        const handle = await bot
          .thread(toChatThreadRef(notification.threadRef))
          .post(notification.message);
        return { externalId: encodeExternalId(channel, handle.id) };
      }
      const handle = await bot.channel(channel).post(notification.message);
      return { externalId: encodeExternalId(channel, handle.id) };
    },
  };
}
