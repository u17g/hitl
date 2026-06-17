import { validateSignature, webhook } from "@line/bot-sdk";
import type { HitlInbox } from "@hitl-sdk/hitl/state";
import type { LineMessagingClient } from "./client.js";
import { parsePostback } from "./constants.js";
import { handlePostbackEvent, type PostbackHandlerOptions } from "./postback.js";

type CallbackRequest = webhook.CallbackRequest;
type PostbackEvent = webhook.PostbackEvent;

export interface LineWebhookHandlerOptions {
  channelSecret: string;
  client: LineMessagingClient;
  inbox: () => HitlInbox;
  /** Non-hitl events and postbacks that fail `parsePostback`. Mirrors Express `else` branches. */
  onFallbackEvent?: (event: webhook.Event) => void | Promise<void>;
}

export type LineWebhookEventsOptions = PostbackHandlerOptions & Pick<LineWebhookHandlerOptions, "onFallbackEvent">;

/** Hitl postbacks first; remaining events go to `onFallbackEvent` when provided. */
export async function handleLineWebhookEvents(
  events: readonly webhook.Event[],
  options: LineWebhookEventsOptions,
): Promise<void> {
  for (const event of events) {
    if (event.type === "postback") {
      const postback = event as PostbackEvent;
      if (parsePostback(postback.postback.data)) {
        await handlePostbackEvent(postback, options);
        continue;
      }
    }
    await options.onFallbackEvent?.(event);
  }
}

export async function handleLineWebhookBody(
  body: string,
  signature: string | null,
  options: LineWebhookHandlerOptions,
): Promise<void> {
  if (!signature || !validateSignature(body, options.channelSecret, signature)) {
    throw new LineWebhookError("Invalid signature", 401);
  }

  let payload: CallbackRequest;
  try {
    payload = JSON.parse(body) as CallbackRequest;
  } catch {
    throw new LineWebhookError("Invalid JSON", 400);
  }

  await handleLineWebhookEvents(payload.events ?? [], {
    client: options.client,
    inbox: options.inbox(),
    onFallbackEvent: options.onFallbackEvent,
  });
}

export class LineWebhookError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "LineWebhookError";
  }
}

/** Fetch-compatible webhook handler for Next.js / Hono route handlers. */
export function createLineWebhookHandler(
  options: LineWebhookHandlerOptions,
): (request: Request) => Promise<Response> {
  return async (request: Request) => {
    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }
    const body = await request.text();
    const signature = request.headers.get("x-line-signature");
    try {
      await handleLineWebhookBody(body, signature, options);
      return new Response("OK", { status: 200 });
    } catch (err) {
      if (err instanceof LineWebhookError) {
        return new Response(err.message, { status: err.status });
      }
      throw err;
    }
  };
}
