import {
  actionById,
  actionFields,
  type Reviewer,
} from "@hitl-sdk/hitl/adapter";
import { validateFeedbacks } from "@hitl-sdk/hitl/adapter";
import type { HitlInbox } from "@hitl-sdk/hitl/state";
import type { messagingApi } from "@line/bot-sdk";
import type { webhook } from "@line/bot-sdk";
import type { LineMessagingClient } from "./client.js";
import { pushToDestination } from "./client.js";
import { POSTBACK_KIND_ACTION, POSTBACK_KIND_FIELD_VALUE, parsePostback } from "./constants.js";
import { destinationFromSource } from "./destination.js";
import {
  canUseInlineFlex,
  needsFeedbackStep,
  parsePostbackFeedbacks,
} from "./fields.js";
import { buildFieldStepFlex, fieldStepForAction } from "./render.js";

type Message = messagingApi.Message;

export interface PostbackHandlerOptions {
  client: LineMessagingClient;
  inbox: HitlInbox;
}

type PostbackEvent = webhook.PostbackEvent;

export async function handlePostbackEvent(
  event: PostbackEvent,
  options: PostbackHandlerOptions,
): Promise<void> {
  const payload = parsePostback(event.postback.data);
  if (!payload) return;

  const by = await reviewerFromEvent(event, options.client);
  const { inbox, client } = options;

  if (payload.k === POSTBACK_KIND_ACTION) {
    await handleActionPostback(payload.r, payload.a, event, { client, inbox, by });
    return;
  }

  if (payload.k === POSTBACK_KIND_FIELD_VALUE) {
    await handleFieldValuePostback(payload, { inbox, by });
  }
}

async function handleActionPostback(
  requestId: string,
  actionId: string,
  event: PostbackEvent,
  options: PostbackHandlerOptions & { by?: Reviewer },
): Promise<void> {
  const { inbox, client, by } = options;
  const record = await inbox.get(requestId);
  const actions = record?.actions ?? [{ id: "approve" }];
  const def = actionById(actions, actionId);
  if (!def) return;

  const fields = actionFields(def);
  if (needsFeedbackStep(fields)) {
    if (!canUseInlineFlex(fields)) return;
    const fieldStep = fieldStepForAction(requestId, actions, actionId);
    if (!fieldStep) return;
    const dest = destinationFromSource(event.source ?? {});
    if (!dest) return;
    if (event.replyToken) {
      await client.replyMessage({ replyToken: event.replyToken, messages: [fieldStep] });
    } else {
      await pushToDestination(client, dest, [fieldStep]);
    }
    return;
  }

  await inbox.resolve(requestId, { actionId, by });
}

async function handleFieldValuePostback(
  payload: { r: string; a: string; f?: string; v?: string },
  options: { inbox: HitlInbox; by?: Reviewer },
): Promise<void> {
  const { inbox, by } = options;
  const { r: requestId, a: actionId, f: fieldKey, v: rawValue } = payload;
  if (!fieldKey || rawValue === undefined) return;

  const record = await inbox.get(requestId);
  const actions = record?.actions ?? [{ id: "approve" }];
  const def = actionById(actions, actionId);
  if (!def) return;

  const fields = actionFields(def);
  const rawFeedbacks = parsePostbackFeedbacks(fields, fieldKey, rawValue);
  const feedbacks = validateFeedbacks(fields, rawFeedbacks);

  await inbox.resolve(requestId, {
    actionId,
    feedbacks,
    by,
  });
}

async function reviewerFromEvent(
  event: PostbackEvent,
  client: LineMessagingClient,
): Promise<Reviewer | undefined> {
  const userId =
    event.source?.type === "user"
      ? event.source.userId
      : event.source?.type === "group"
        ? event.source.userId
        : event.source?.type === "room"
          ? event.source.userId
          : undefined;
  if (!userId) return undefined;
  try {
    const profile = await client.getProfile(userId);
    return { id: userId, name: profile.displayName };
  } catch {
    return { id: userId };
  }
}

export { buildFieldStepFlex };
