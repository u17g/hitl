import type { HumanRequest, HumanResult, HitlAdapter, Notification } from "@hitl-sdk/hitl/adapter";
import type { HitlInbox } from "@hitl-sdk/hitl/state";
import { buildLiffUri, createLineFeedbackFormHandler, createLineFeedbackHandler, signFeedbackToken } from "./feedback.js";
import { pushToDestination, type LineMessagingClient } from "./client.js";
import { encodeExternalId, decodeExternalId } from "./external-id.js";
import { parseDestination } from "./destination.js";
import { LINE_CHANNEL_KEY, LINE_FEEDBACK_PATH } from "./constants.js";
import { actionFields } from "@hitl-sdk/hitl/adapter";
import { needsLiff } from "./fields.js";
import { buildApprovalFlex, buildOutcomeText } from "./render.js";

export interface LineAdapterOptions {
  /** Adapter id, the routing key prefix used by `waitForHuman({ channel })`. */
  id: string;
  /** LINE Messaging API client (`LineBotClient.fromChannelAccessToken(...)`). */
  client: LineMessagingClient;
  /** Default destination when the routing key is adapter id only, e.g. `user:U123`. */
  defaultChannel?: string;
  /**
   * The hitl inbox, resolved lazily. `new Hitl()` needs the adapters before
   * the inbox exists, so pass `() => hitl.inbox`.
   */
  inbox: () => HitlInbox;
  /** LIFF app id for actions that need text/textarea or multi-field feedback. */
  liffId?: string;
  /** HMAC secret for signed LIFF feedback tokens. Required when `liffId` is set. */
  feedbackSecret?: string;
}

function resolveDestination(
  request: { destination?: string },
  defaultChannel: string | undefined,
): string {
  const dest = request.destination ?? defaultChannel;
  if (dest === undefined) {
    throw new Error(
      "LINE adapter has no defaultChannel; pass channel as adapter_id:destination (e.g. line-approvals:user:U123).",
    );
  }
  return dest;
}

export function createLineAdapter(options: LineAdapterOptions): HitlAdapter {
  const { client, defaultChannel, liffId, feedbackSecret } = options;
  const sent = new Map<string, { destination: string; message: string }>();

  function liffUriFor(requestId: string, actionId: string): string | undefined {
    if (!liffId || !feedbackSecret) return undefined;
    const token = signFeedbackToken({ requestId, actionId, secret: feedbackSecret });
    return buildLiffUri(liffId, token);
  }

  function assertLiffConfigured(request: HumanRequest): void {
    for (const def of request.actions) {
      if (needsLiff(actionFields(def)) && (!liffId || !feedbackSecret)) {
        throw new Error(
          `LINE action "${def.id}" requires LIFF feedback fields; set liffId and feedbackSecret on createLineAdapter.`,
        );
      }
    }
  }

  const adapter: HitlAdapter = {
    id: options.id,
    ...(defaultChannel !== undefined ? { defaultChannel } : {}),

    async send(request: HumanRequest): Promise<{ externalId: string }> {
      assertLiffConfigured(request);
      const dest = resolveDestination(request, defaultChannel);
      parseDestination(dest);
      const message = buildApprovalFlex(request, (actionId) => liffUriFor(request.id, actionId));
      const messageId = await pushToDestination(client, dest, [message]);
      const externalId = encodeExternalId(dest, messageId);
      sent.set(externalId, { destination: dest, message: request.message });
      return { externalId };
    },

    async update(externalId: string, result: HumanResult): Promise<void> {
      const entry = sent.get(externalId);
      let destination: string;
      let message: string;
      if (entry) {
        destination = entry.destination;
        message = entry.message;
      } else {
        try {
          destination = decodeExternalId(externalId).destination;
        } catch {
          return;
        }
        message = "Approval request";
      }
      const text = buildOutcomeText(message, result);
      await pushToDestination(client, destination, [{ type: "text", text }]);
      sent.delete(externalId);
    },

    async notify(notification: Notification): Promise<{ externalId?: string }> {
      const dest = resolveDestination(notification, defaultChannel);
      const messageId = await pushToDestination(client, dest, [
        { type: "text", text: notification.message },
      ]);
      return { externalId: encodeExternalId(dest, messageId) };
    },
  };

  if (feedbackSecret) {
    const feedbackOptions = { secret: feedbackSecret, inbox: options.inbox };
    const handleFeedbackGet = createLineFeedbackFormHandler(feedbackOptions);
    const handleFeedbackPost = createLineFeedbackHandler(feedbackOptions);
    adapter.channelKey = LINE_CHANNEL_KEY;
    adapter.fetch = async (req: Request): Promise<Response> => {
      if (new URL(req.url).pathname !== LINE_FEEDBACK_PATH) {
        return new Response("Not Found", { status: 404 });
      }
      if (req.method === "GET") return handleFeedbackGet(req);
      if (req.method === "POST") return handleFeedbackPost(req);
      return new Response("Method Not Allowed", { status: 405 });
    };
  }

  return adapter;
}

export type { LineMessagingClient };
