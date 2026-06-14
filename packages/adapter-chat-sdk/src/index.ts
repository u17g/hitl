import type { HumanRequest, HumanResult, HitlAdapter, Notification } from "@hitl-sdk/hitl/adapter";
import type { HitlInbox } from "@hitl-sdk/hitl/state";
import type { Chat, SentMessage } from "chat";
import { registerHitlHandlers } from "./actions";
import { channelFromDestination, isThreadDestination, threadDestination } from "./destination";
import { encodeExternalId } from "./external-id";
import { humanRequestCard, resultCard } from "./render";

export interface ChatSdkAdapterOptions {
  /** Adapter id, the routing key prefix used by `waitForHuman({ channel })`. */
  id: string;
  /** The shared Chat SDK instance that owns the webhooks and handler registry. */
  bot: Chat;
  /** Default Chat SDK channel ref when the routing key is adapter id only, e.g. "slack:C123". */
  defaultChannel?: string;
  /**
   * The hitl inbox, resolved lazily. `new Hitl()` needs the adapters before
   * the inbox exists, so pass `() => hitl.inbox`; the handlers call it per event.
   */
  inbox: () => HitlInbox;
}

function resolveDestination(
  request: { destination?: string },
  defaultChannel: string | undefined,
): string {
  const dest = request.destination ?? defaultChannel;
  if (dest === undefined) {
    throw new Error(
      "Chat SDK adapter has no defaultChannel; pass channel as adapter_id:destination (e.g. approvals:slack:C123).",
    );
  }
  return dest;
}

function postTarget(bot: Chat, dest: string) {
  if (isThreadDestination(dest)) {
    return bot.thread(threadDestination(dest));
  }
  return bot.channel(dest);
}

export function createChatSdkAdapter(options: ChatSdkAdapterOptions): HitlAdapter {
  const { bot, defaultChannel } = options;
  const sent = new Map<string, { handle: SentMessage; message: string }>();

  registerHitlHandlers(bot, options.inbox);

  return {
    id: options.id,
    ...(defaultChannel !== undefined ? { defaultChannel } : {}),

    async send(request: HumanRequest): Promise<{ externalId: string }> {
      const dest = resolveDestination(request, defaultChannel);
      const handle = await postTarget(bot, dest).post(humanRequestCard(request));
      const externalId = encodeExternalId(channelFromDestination(dest), handle.id);
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
      const dest = resolveDestination(notification, defaultChannel);
      const handle = await postTarget(bot, dest).post(notification.message);
      return { externalId: encodeExternalId(channelFromDestination(dest), handle.id) };
    },
  };
}
