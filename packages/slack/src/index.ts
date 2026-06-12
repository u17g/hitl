import type { ApprovalRequest, ApprovalResult, HitlPlugin, Notification } from "@openhitl/sdk";
import { parseSlackCallback } from "./callback";
import { renderApprovalBlocks, renderResultBlocks, type SlackBlock } from "./render";

export interface SlackHitlOptions {
  /** Plugin id, the routing key used by `waitForApproval({ channel })`. */
  id: string;
  /** Slack channel to post into, e.g. "#inbound-leads" or a channel id. */
  channel: string;
  /** Bot token (`xoxb-...`), typically `process.env.SLACK_BOT_TOKEN`. */
  token: string | undefined;
  /** Test seam; defaults to the global fetch. */
  fetch?: typeof fetch;
}

interface SlackApiResponse {
  ok: boolean;
  error?: string;
  ts?: string;
  channel?: string;
}

/** Renders approvals as Block Kit messages with input fields and approve/deny buttons. */
export function slackHitl(options: SlackHitlOptions): HitlPlugin {
  const fetchImpl = options.fetch ?? fetch;
  // chat.update needs the original message text; remember it per delivered message.
  const sentMessages = new Map<string, string>();

  async function slackApi(method: string, body: Record<string, unknown>): Promise<SlackApiResponse> {
    const res = await fetchImpl(`https://slack.com/api/${method}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${options.token}`,
        "content-type": "application/json; charset=utf-8",
      },
      body: JSON.stringify(body),
    });
    const data = (await res.json()) as SlackApiResponse;
    if (!data.ok) {
      throw new Error(`Slack ${method} failed: ${data.error ?? "unknown error"}`);
    }
    return data;
  }

  function postMessage(body: Record<string, unknown>): Promise<SlackApiResponse> {
    return slackApi("chat.postMessage", body);
  }

  return {
    id: options.id,

    async send(request: ApprovalRequest): Promise<{ externalId: string }> {
      const data = await postMessage({
        channel: options.channel,
        text: request.message,
        blocks: renderApprovalBlocks(request),
      });
      const externalId = `${data.channel}:${data.ts}`;
      sentMessages.set(externalId, request.message);
      return { externalId };
    },

    async update(externalId: string, result: ApprovalResult): Promise<void> {
      const { channel, ts } = splitExternalId(externalId);
      const message = sentMessages.get(externalId) ?? "";
      const blocks: SlackBlock[] = renderResultBlocks(message, result);
      await slackApi("chat.update", { channel, ts, text: message, blocks });
      sentMessages.delete(externalId);
    },

    async notify(notification: Notification): Promise<void> {
      if (notification.parentExternalId) {
        const { channel, ts } = splitExternalId(notification.parentExternalId);
        await postMessage({ channel, thread_ts: ts, text: notification.message });
        return;
      }
      await postMessage({ channel: options.channel, text: notification.message });
    },

    handleCallback: parseSlackCallback,
  };
}

function splitExternalId(externalId: string): { channel: string; ts: string } {
  const separator = externalId.indexOf(":");
  return {
    channel: externalId.slice(0, separator),
    ts: externalId.slice(separator + 1),
  };
}

export { parseSlackCallback } from "./callback";
export { renderApprovalBlocks, renderResultBlocks } from "./render";
export type { SlackBlock } from "./render";
