import type { messagingApi } from "@line/bot-sdk";

type Message = messagingApi.Message;

/** Minimal LINE client surface used by the adapter. */
export interface LineMessagingClient {
  pushMessage(args: { to: string; messages: Message[] }): Promise<{ sentMessages?: Array<{ id?: string }> }>;
  replyMessage(args: { replyToken: string; messages: Message[] }): Promise<unknown>;
  getProfile(userId: string): Promise<{ displayName?: string; userId?: string }>;
}

export function toLineClient(client: {
  pushMessage: LineMessagingClient["pushMessage"];
  replyMessage: LineMessagingClient["replyMessage"];
  getProfile: LineMessagingClient["getProfile"];
}): LineMessagingClient {
  return client;
}

import { parseDestination } from "./destination.js";

export async function pushToDestination(
  client: LineMessagingClient,
  destinationRef: string,
  messages: Message[],
): Promise<string> {
  const { to } = parseDestination(destinationRef);
  const response = await client.pushMessage({ to, messages });
  const id = response.sentMessages?.[0]?.id;
  if (!id) {
    throw new Error("LINE pushMessage did not return a sent message id.");
  }
  return id;
}
