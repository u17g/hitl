import type {
  ApprovalRequest,
  ApprovalResult,
  BatchApprovalRequest,
  HitlPlugin,
  Notification,
} from "@hitldev/sdk";
import { clearTokenCache, getBotFrameworkToken } from "./auth";
import { parseTeamsCallback } from "./callback";
import {
  createChannelConversation,
  createUserConversation,
  DEFAULT_SERVICE_URL,
  postMessage,
  replyToActivity,
  sendActivity,
  updateActivity,
} from "./connector";
import {
  MAX_CARD_BYTES,
  renderApprovalCard,
  renderBatchCard,
  renderBatchResultCard,
  renderResultCard,
} from "./render";

export type TeamsTarget =
  | { type: "channel"; teamId: string; channelId: string }
  | { type: "channel"; conversationId: string; serviceUrl?: string }
  | { type: "user"; userId: string; serviceUrl?: string };

export interface TeamsHitlOptions {
  /** Plugin id, the routing key used by `waitForApproval({ channel })`. */
  id: string;
  /** Where approval messages are delivered. */
  target: TeamsTarget;
  /** Microsoft App ID, typically `process.env.MICROSOFT_APP_ID`. */
  appId: string | undefined;
  /** Microsoft App Password (client secret), typically `process.env.MICROSOFT_APP_PASSWORD`. */
  appPassword: string | undefined;
  /** Azure AD tenant id; required for createConversation in multi-tenant bots. */
  tenantId?: string;
  /** Test seam; defaults to the global fetch. */
  fetch?: typeof fetch;
}

interface ResolvedTarget {
  conversationId?: string;
  serviceUrl: string;
  cacheKey?: string;
}

/** Renders approvals as Adaptive Cards with input fields and approve/deny actions. */
export function teamsHitl(options: TeamsHitlOptions): HitlPlugin {
  const fetchImpl = options.fetch ?? fetch;
  const appId = options.appId ?? "";
  const appPassword = options.appPassword ?? "";
  const sentMessages = new Map<string, string>();
  // updateBatch re-renders the items; remember the request per delivered batch.
  const sentBatches = new Map<string, BatchApprovalRequest>();
  const conversationCache = new Map<string, string>();
  let serviceUrl = resolveInitialServiceUrl(options.target);

  function resolveInitialServiceUrl(target: TeamsTarget): string {
    if (target.type === "channel" && "conversationId" in target && target.serviceUrl) {
      return target.serviceUrl;
    }
    if (target.type === "user" && target.serviceUrl) {
      return target.serviceUrl;
    }
    return DEFAULT_SERVICE_URL;
  }

  function targetDescriptor(): ResolvedTarget {
    const target = options.target;
    if (target.type === "channel" && "conversationId" in target) {
      return {
        conversationId: target.conversationId,
        serviceUrl: target.serviceUrl ?? serviceUrl,
      };
    }
    if (target.type === "channel") {
      const cacheKey = `${target.teamId}:${target.channelId}`;
      return {
        cacheKey,
        conversationId: conversationCache.get(cacheKey),
        serviceUrl,
      };
    }
    const cacheKey = `user:${target.userId}`;
    return {
      cacheKey,
      conversationId: conversationCache.get(cacheKey),
      serviceUrl: target.serviceUrl ?? serviceUrl,
    };
  }

  async function connectorToken(): Promise<string> {
    return getBotFrameworkToken({ appId, appPassword, fetch: fetchImpl });
  }

  async function ensureConversation(): Promise<string> {
    const descriptor = targetDescriptor();
    if (descriptor.conversationId) return descriptor.conversationId;

    const token = await connectorToken();
    const connectorOpts = {
      serviceUrl: descriptor.serviceUrl,
      appId,
      token,
      fetch: fetchImpl,
    };

    const target = options.target;
    let created;
    if (target.type === "channel" && "teamId" in target) {
      created = await createChannelConversation(connectorOpts, {
        teamId: target.teamId,
        channelId: target.channelId,
        tenantId: options.tenantId,
      });
    } else if (target.type === "user") {
      created = await createUserConversation(connectorOpts, {
        userId: target.userId,
        tenantId: options.tenantId,
      });
    } else {
      throw new Error("Teams conversation id is required for this target configuration");
    }

    if (created.serviceUrl) {
      serviceUrl = created.serviceUrl;
    }
    if (descriptor.cacheKey) {
      conversationCache.set(descriptor.cacheKey, created.id);
    }
    return created.id;
  }

  return {
    id: options.id,

    async send(request: ApprovalRequest): Promise<{ externalId: string }> {
      const conversationId = await ensureConversation();
      const token = await connectorToken();
      const descriptor = targetDescriptor();
      const card = renderApprovalCard(request);
      const activity = await sendActivity(
        {
          serviceUrl: descriptor.serviceUrl,
          appId,
          token,
          fetch: fetchImpl,
        },
        conversationId,
        card,
      );
      if (activity.serviceUrl) {
        serviceUrl = activity.serviceUrl;
      }
      const externalId = `${conversationId}:${activity.id}`;
      sentMessages.set(externalId, request.message);
      return { externalId };
    },

    async sendBatch(request: BatchApprovalRequest): Promise<{ externalId: string }> {
      const conversationId = await ensureConversation();
      const token = await connectorToken();
      const descriptor = targetDescriptor();
      const card = renderBatchCard(request);
      const activity = await sendActivity(
        {
          serviceUrl: descriptor.serviceUrl,
          appId,
          token,
          fetch: fetchImpl,
        },
        conversationId,
        card,
      );
      if (activity.serviceUrl) {
        serviceUrl = activity.serviceUrl;
      }
      const externalId = `${conversationId}:${activity.id}`;
      sentBatches.set(externalId, request);
      return { externalId };
    },

    canSendBatch(request: BatchApprovalRequest): boolean {
      return JSON.stringify(renderBatchCard(request)).length <= MAX_CARD_BYTES;
    },

    async updateBatch(externalId: string, results: ApprovalResult[]): Promise<void> {
      const request = sentBatches.get(externalId);
      if (!request) return;
      const { conversationId, activityId } = splitExternalId(externalId);
      const token = await connectorToken();
      await updateActivity(
        { serviceUrl, appId, token, fetch: fetchImpl },
        conversationId,
        activityId,
        renderBatchResultCard(request, results),
      );
      sentBatches.delete(externalId);
    },

    async update(externalId: string, result: ApprovalResult): Promise<void> {
      const { conversationId, activityId } = splitExternalId(externalId);
      const message = sentMessages.get(externalId) ?? "";
      const token = await connectorToken();
      const card = renderResultCard(message, result);
      await updateActivity(
        { serviceUrl, appId, token, fetch: fetchImpl },
        conversationId,
        activityId,
        card,
      );
      sentMessages.delete(externalId);
    },

    async notify(notification: Notification): Promise<void> {
      const token = await connectorToken();
      const connectorOpts = { serviceUrl, appId, token, fetch: fetchImpl };

      if (notification.parentExternalId) {
        const { conversationId, activityId } = splitExternalId(notification.parentExternalId);
        await replyToActivity(connectorOpts, conversationId, activityId, notification.message);
        return;
      }

      const conversationId = await ensureConversation();
      await postMessage(connectorOpts, conversationId, notification.message);
    },

    handleCallback: (req) =>
      parseTeamsCallback(req, {
        appId,
        fetch: fetchImpl,
      }),
  };
}

function splitExternalId(externalId: string): { conversationId: string; activityId: string } {
  const separator = externalId.indexOf(":");
  return {
    conversationId: externalId.slice(0, separator),
    activityId: externalId.slice(separator + 1),
  };
}

export { parseTeamsCallback } from "./callback";
export {
  extractBatchDecisions,
  extractFeedbacks,
  renderApprovalCard,
  renderBatchCard,
  renderBatchResultCard,
  renderResultCard,
} from "./render";
export { verifyTeamsRequest, clearJwksCache, setJwksForTests } from "./verify";
export { clearTokenCache } from "./auth";
export type { AdaptiveCard } from "./render";
