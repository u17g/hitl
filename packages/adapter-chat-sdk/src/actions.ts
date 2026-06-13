import type { HitlInbox, Reviewer } from "hitl";
import { actionById, actionFields } from "hitl";
import type { ActionEvent, Chat, ModalSubmitEvent } from "chat";
import {
  actionButtonId,
  actionModalCallback,
  parseActionButtonId,
  parseActionModalCallback,
} from "./constants";
import { needsModal, parseModalValues } from "./fields";
import { actionModalFromRequest } from "./render";

const wired = new WeakSet<object>();

/**
 * Wire action clicks and modal submits on a Chat instance to the inbox.
 * The inbox is resolved lazily so it can be created after the adapters.
 */
export function registerHitlHandlers(bot: Chat, getInbox: () => HitlInbox): void {
  if (wired.has(bot)) return;
  wired.add(bot);

  bot.onAction((event) => {
    if (!parseActionButtonId(event.actionId)) return;
    return handleAction(event, getInbox());
  });
  bot.onModalSubmit((event) => {
    if (!parseActionModalCallback(event.callbackId)) return;
    return handleModalSubmit(event, getInbox());
  });
}

function reviewerFrom(user: ActionEvent["user"] | undefined): Reviewer | undefined {
  if (!user) return undefined;
  return { id: user.userId, name: user.fullName };
}

async function handleAction(event: ActionEvent, inbox: HitlInbox): Promise<void> {
  const requestId = event.value;
  const actionId = parseActionButtonId(event.actionId);
  if (!requestId || !actionId) return;
  const by = reviewerFrom(event.user);
  const record = await inbox.get(requestId);
  const actions = record?.actions ?? [{ id: "approve" }];
  const def = actionById(actions, actionId);
  if (!def) return;

  const fields = actionFields(def);
  if (needsModal(fields)) {
    await event.openModal(actionModalFromRequest(requestId, actions, actionId));
    return;
  }
  await inbox.resolve(requestId, { actionId, by });
}

async function handleModalSubmit(event: ModalSubmitEvent, inbox: HitlInbox): Promise<void> {
  const parsed = parseModalMetadata(event.privateMetadata);
  const actionId = parsed?.actionId ?? parseActionModalCallback(event.callbackId);
  if (!parsed?.requestId || !actionId) return;
  const by = reviewerFrom(event.user);

  const record = await inbox.get(parsed.requestId);
  const actions = record?.actions ?? [{ id: "approve" }];
  const def = actionById(actions, actionId);
  if (!def) return;

  const fields = actionFields(def);
  const feedbacks = parseModalValues(fields, event.values);

  await inbox.resolve(parsed.requestId, {
    actionId,
    feedbacks: Object.keys(feedbacks).length > 0 ? feedbacks : undefined,
    by,
  });
}

function parseModalMetadata(
  privateMetadata: string | undefined,
): { requestId?: string; actionId?: string } | undefined {
  if (!privateMetadata) return undefined;
  try {
    const parsed = JSON.parse(privateMetadata) as {
      requestId?: string;
      actionId?: string;
      action?: string;
    };
    return {
      requestId: parsed.requestId,
      actionId: parsed.actionId ?? parsed.action,
    };
  } catch {
    return undefined;
  }
}

// Re-export for tests that import modal callback helpers.
export { actionModalCallback };
