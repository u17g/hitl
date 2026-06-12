import type { HitlCallback, HitlField } from "@hitldev/sdk";
import {
  APPROVE_PREFIX,
  DENY_PREFIX,
  MODAL_PREFIX,
  parseModalFeedbacks,
  parsePrefixedCustomId,
  renderApprovalModal,
} from "./render";
import { verifyDiscordRequest } from "./verify";

const INTERACTION_PING = 1;
const INTERACTION_MESSAGE_COMPONENT = 3;
const INTERACTION_MODAL_SUBMIT = 5;

const RESPONSE_PONG = 1;
const RESPONSE_DEFERRED_UPDATE = 6;
const RESPONSE_MODAL = 9;

interface DiscordUser {
  id?: string;
  username?: string;
}

interface DiscordInteraction {
  type: number;
  data?: {
    custom_id?: string;
    components?: { components?: { custom_id?: string; value?: string }[] }[];
  };
  member?: { user?: DiscordUser };
  user?: DiscordUser;
}

export interface ParseDiscordCallbackOptions {
  publicKey: string;
  /** Stored fields per request id, populated by send(). */
  pendingFields: Map<string, Record<string, HitlField>>;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function deferredUpdateResponse(): Response {
  return jsonResponse({ type: RESPONSE_DEFERRED_UPDATE });
}

function reviewerFrom(interaction: DiscordInteraction) {
  const user = interaction.member?.user ?? interaction.user;
  return user ? { id: user.id, name: user.username } : undefined;
}

/**
 * Parse a Discord interaction callback.
 * Returns null when the request is not a Discord hitldev interaction.
 */
export async function parseDiscordCallback(
  req: Request,
  options: ParseDiscordCallbackOptions,
): Promise<HitlCallback | null> {
  if (req.method !== "POST") return null;
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return null;

  const signature = req.headers.get("x-signature-ed25519");
  const timestamp = req.headers.get("x-signature-timestamp");
  if (!signature || !timestamp) return null;

  const body = await req.text();
  if (!verifyDiscordRequest(options.publicKey, signature, timestamp, body)) {
    return {
      requestId: "",
      decision: "deny",
      response: new Response("Invalid request signature", { status: 401 }),
      ackOnly: true,
    };
  }

  let interaction: DiscordInteraction;
  try {
    interaction = JSON.parse(body) as DiscordInteraction;
  } catch {
    return null;
  }

  if (interaction.type === INTERACTION_PING) {
    return {
      requestId: "",
      decision: "approve",
      ackOnly: true,
      response: jsonResponse({ type: RESPONSE_PONG }),
    };
  }

  if (interaction.type === INTERACTION_MESSAGE_COMPONENT) {
    return parseMessageComponent(interaction, options.pendingFields);
  }

  if (interaction.type === INTERACTION_MODAL_SUBMIT) {
    return parseModalSubmit(interaction, options.pendingFields);
  }

  return null;
}

function parseMessageComponent(
  interaction: DiscordInteraction,
  pendingFields: Map<string, Record<string, HitlField>>,
): HitlCallback | null {
  const customId = interaction.data?.custom_id;
  if (!customId) return null;

  const denyId = parsePrefixedCustomId(DENY_PREFIX, customId);
  if (denyId) {
    return {
      requestId: denyId,
      decision: "deny",
      by: reviewerFrom(interaction),
      response: deferredUpdateResponse(),
    };
  }

  const approveId = parsePrefixedCustomId(APPROVE_PREFIX, customId);
  if (!approveId) return null;

  const fields = pendingFields.get(approveId);
  if (!fields || Object.keys(fields).length === 0) {
    return {
      requestId: approveId,
      decision: "approve",
      by: reviewerFrom(interaction),
      response: deferredUpdateResponse(),
    };
  }

  return {
    requestId: approveId,
    decision: "approve",
    ackOnly: true,
    response: jsonResponse({
      type: RESPONSE_MODAL,
      data: renderApprovalModal(approveId, fields),
    }),
  };
}

function parseModalSubmit(
  interaction: DiscordInteraction,
  pendingFields: Map<string, Record<string, HitlField>>,
): HitlCallback | null {
  const customId = interaction.data?.custom_id;
  if (!customId) return null;

  const requestId = parsePrefixedCustomId(MODAL_PREFIX, customId);
  if (!requestId) return null;

  const fields = pendingFields.get(requestId) ?? {};
  const feedbacks = parseModalFeedbacks(fields, interaction.data?.components ?? []);

  return {
    requestId,
    decision: "approve",
    by: reviewerFrom(interaction),
    feedbacks: Object.keys(feedbacks).length > 0 ? feedbacks : undefined,
    response: deferredUpdateResponse(),
  };
}

export {
  APPROVE_PREFIX,
  DENY_PREFIX,
  MODAL_PREFIX,
  RESPONSE_DEFERRED_UPDATE,
  RESPONSE_MODAL,
  RESPONSE_PONG,
};
