import type { AdaptiveCard } from "./render";

export const DEFAULT_SERVICE_URL = "https://smba.trafficmanager.net/teams/";

export interface BotConnectorOptions {
  serviceUrl: string;
  appId: string;
  token: string;
  fetch?: typeof fetch;
}

export interface CreateChannelConversationParams {
  teamId: string;
  channelId: string;
  tenantId?: string;
}

export interface CreateUserConversationParams {
  userId: string;
  tenantId?: string;
}

export interface ActivityResponse {
  id: string;
  serviceUrl?: string;
}

export interface ConversationResponse {
  id: string;
  serviceUrl?: string;
}

function normalizeServiceUrl(serviceUrl: string): string {
  return serviceUrl.endsWith("/") ? serviceUrl : `${serviceUrl}/`;
}

function connectorFetch(
  options: BotConnectorOptions,
  method: string,
  path: string,
  body?: Record<string, unknown>,
): Promise<Response> {
  const fetchImpl = options.fetch ?? fetch;
  const base = normalizeServiceUrl(options.serviceUrl);
  return fetchImpl(`${base}${path.replace(/^\//, "")}`, {
    method,
    headers: {
      authorization: `Bearer ${options.token}`,
      "content-type": "application/json",
    },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });
}

async function parseJson<T>(res: Response, label: string): Promise<T> {
  const data = (await res.json()) as T & { message?: string };
  if (!res.ok) {
    throw new Error(`${label} failed: ${(data as { message?: string }).message ?? res.statusText}`);
  }
  return data;
}

function botAccount(appId: string) {
  return { id: appId, name: "hitldev" };
}

export async function createChannelConversation(
  options: BotConnectorOptions,
  params: CreateChannelConversationParams,
): Promise<ConversationResponse> {
  const body: Record<string, unknown> = {
    bot: botAccount(options.appId),
    isGroup: true,
    channelData: {
      channel: { id: params.channelId },
      team: { id: params.teamId },
      ...(params.tenantId && { tenant: { id: params.tenantId } }),
    },
  };
  const res = await connectorFetch(options, "POST", "v3/conversations", body);
  return parseJson<ConversationResponse>(res, "Create channel conversation");
}

export async function createUserConversation(
  options: BotConnectorOptions,
  params: CreateUserConversationParams,
): Promise<ConversationResponse> {
  const body: Record<string, unknown> = {
    bot: botAccount(options.appId),
    members: [{ id: params.userId }],
    isGroup: false,
    ...(params.tenantId && { channelData: { tenant: { id: params.tenantId } } }),
  };
  const res = await connectorFetch(options, "POST", "v3/conversations", body);
  return parseJson<ConversationResponse>(res, "Create user conversation");
}

function adaptiveAttachment(card: AdaptiveCard) {
  return {
    contentType: "application/vnd.microsoft.card.adaptive",
    content: card,
  };
}

export async function sendActivity(
  options: BotConnectorOptions,
  conversationId: string,
  card: AdaptiveCard,
  extra?: Record<string, unknown>,
): Promise<ActivityResponse> {
  const body = {
    type: "message",
    attachments: [adaptiveAttachment(card)],
    ...extra,
  };
  const res = await connectorFetch(
    options,
    "POST",
    `v3/conversations/${encodeURIComponent(conversationId)}/activities`,
    body,
  );
  return parseJson<ActivityResponse>(res, "Send activity");
}

export async function updateActivity(
  options: BotConnectorOptions,
  conversationId: string,
  activityId: string,
  card: AdaptiveCard,
): Promise<ActivityResponse> {
  const body = {
    type: "message",
    id: activityId,
    attachments: [adaptiveAttachment(card)],
  };
  const res = await connectorFetch(
    options,
    "PUT",
    `v3/conversations/${encodeURIComponent(conversationId)}/activities/${encodeURIComponent(activityId)}`,
    body,
  );
  return parseJson<ActivityResponse>(res, "Update activity");
}

export async function replyToActivity(
  options: BotConnectorOptions,
  conversationId: string,
  replyToId: string,
  text: string,
): Promise<ActivityResponse> {
  const body = {
    type: "message",
    text,
    replyToId,
  };
  const res = await connectorFetch(
    options,
    "POST",
    `v3/conversations/${encodeURIComponent(conversationId)}/activities`,
    body,
  );
  return parseJson<ActivityResponse>(res, "Reply to activity");
}

export async function postMessage(
  options: BotConnectorOptions,
  conversationId: string,
  text: string,
): Promise<ActivityResponse> {
  const body = { type: "message", text };
  const res = await connectorFetch(
    options,
    "POST",
    `v3/conversations/${encodeURIComponent(conversationId)}/activities`,
    body,
  );
  return parseJson<ActivityResponse>(res, "Post message");
}
