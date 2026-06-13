import type {
  ApprovalRequest,
  ApprovalResult,
  BatchApprovalRequest,
  HitlPlugin,
  Notification,
} from "@hitldev/sdk";
import { parseDiscordCallback, type PendingBatch } from "./callback";
import {
  MAX_BATCH_ITEMS,
  renderApprovalMessage,
  renderBatchMessage,
  renderBatchResultMessage,
  renderResultMessage,
} from "./render";

export interface DiscordHitlOptions {
  /** Plugin id, the routing key used by `waitForApproval({ channel })`. */
  id: string;
  /** Discord channel id to post into. */
  channelId: string;
  /** Bot token, typically `process.env.DISCORD_BOT_TOKEN`. */
  token: string | undefined;
  /** Application public key (hex), typically `process.env.DISCORD_PUBLIC_KEY`. */
  publicKey: string | undefined;
  /** Test seam; defaults to the global fetch. */
  fetch?: typeof fetch;
}

interface DiscordMessageResponse {
  id: string;
  channel_id: string;
}

const API_BASE = "https://discord.com/api/v10";

/** Renders approvals as embed messages with approve/deny buttons and modal feedback. */
export function discordHitl(options: DiscordHitlOptions): HitlPlugin {
  const fetchImpl = options.fetch ?? fetch;
  const sentMessages = new Map<string, string>();
  const pendingFields = new Map<string, ApprovalRequest["fields"]>();
  // updateBatch re-renders the items; remember the request per delivered batch.
  const sentBatches = new Map<string, BatchApprovalRequest>();
  // Select state per batch id; the submit click resolves it into decisions.
  const pendingBatches = new Map<string, PendingBatch>();

  async function discordApi(
    method: string,
    path: string,
    body?: Record<string, unknown>,
  ): Promise<DiscordMessageResponse> {
    const res = await fetchImpl(`${API_BASE}${path}`, {
      method,
      headers: {
        authorization: `Bot ${options.token}`,
        "content-type": "application/json",
      },
      ...(body && { body: JSON.stringify(body) }),
    });
    const data = (await res.json()) as DiscordMessageResponse & { message?: string };
    if (!res.ok) {
      throw new Error(`Discord ${method} ${path} failed: ${data.message ?? res.statusText}`);
    }
    return data;
  }

  return {
    id: options.id,
    provider: "discord",

    async send(request: ApprovalRequest): Promise<{ externalId: string }> {
      const payload = renderApprovalMessage(request);
      const data = await discordApi("POST", `/channels/${options.channelId}/messages`, payload);
      const externalId = `${data.channel_id}:${data.id}`;
      sentMessages.set(externalId, request.message);
      pendingFields.set(request.id, request.fields);
      return { externalId };
    },

    async sendBatch(request: BatchApprovalRequest): Promise<{ externalId: string }> {
      const payload = renderBatchMessage(request);
      const data = await discordApi("POST", `/channels/${options.channelId}/messages`, payload);
      const externalId = `${data.channel_id}:${data.id}`;
      sentBatches.set(externalId, request);
      pendingBatches.set(request.batchId, {
        itemIds: request.items.map((item) => item.id),
        selected: null,
      });
      return { externalId };
    },

    // Discord has no message-level form: field editing needs the per-item
    // modal, and string selects carry at most 25 options.
    canSendBatch(request: BatchApprovalRequest): boolean {
      return (
        Object.keys(request.fields).length === 0 && request.items.length <= MAX_BATCH_ITEMS
      );
    },

    async updateBatch(externalId: string, results: ApprovalResult[]): Promise<void> {
      const request = sentBatches.get(externalId);
      if (!request) return;
      const { channelId, messageId } = splitExternalId(externalId);
      await discordApi(
        "PATCH",
        `/channels/${channelId}/messages/${messageId}`,
        renderBatchResultMessage(request, results),
      );
      sentBatches.delete(externalId);
      pendingBatches.delete(request.batchId);
    },

    async update(externalId: string, result: ApprovalResult): Promise<void> {
      const { channelId, messageId } = splitExternalId(externalId);
      const message = sentMessages.get(externalId) ?? "";
      const payload = renderResultMessage(message, result);
      await discordApi("PATCH", `/channels/${channelId}/messages/${messageId}`, payload);
      sentMessages.delete(externalId);
      pendingFields.delete(result.id);
    },

    async notify(notification: Notification): Promise<void> {
      const body: Record<string, unknown> = {
        content: notification.message,
      };
      if (notification.parentExternalId) {
        const { messageId } = splitExternalId(notification.parentExternalId);
        body.message_reference = { message_id: messageId };
      }
      await discordApi("POST", `/channels/${options.channelId}/messages`, body);
    },

    handleCallback: (req) =>
      parseDiscordCallback(req, {
        publicKey: options.publicKey ?? "",
        pendingFields,
        pendingBatches,
      }),
  };
}

function splitExternalId(externalId: string): { channelId: string; messageId: string } {
  const separator = externalId.indexOf(":");
  return {
    channelId: externalId.slice(0, separator),
    messageId: externalId.slice(separator + 1),
  };
}

export { parseDiscordCallback } from "./callback";
export type { PendingBatch } from "./callback";
export {
  parseModalFeedbacks,
  renderApprovalMessage,
  renderApprovalModal,
  renderBatchMessage,
  renderBatchResultMessage,
  renderResultMessage,
} from "./render";
export { verifyDiscordRequest } from "./verify";
export type { DiscordComponent, DiscordEmbed } from "./render";
