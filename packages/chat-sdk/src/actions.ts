import type { HitlInbox, Reviewer } from "@hitldev/sdk";
import type { ActionEvent, Chat, ModalSubmitEvent } from "chat";
import { ACTION_APPROVE, ACTION_DENY, MODAL_CALLBACK } from "./constants";
import { needsModal, parseModalValues } from "./fields";
import { approvalModal } from "./render";

/** Bots that already have hitldev handlers wired, so multiple plugins sharing a
 * Chat instance register the global onAction/onModalSubmit handlers only once. */
const wired = new WeakSet<object>();

/**
 * Wire approve/deny clicks and modal submits on a Chat instance to the inbox.
 * The inbox is resolved lazily so it can be created after the plugins (which
 * `createHitl` requires up front). Idempotent per bot.
 */
export function registerHitlHandlers(bot: Chat, getInbox: () => HitlInbox): void {
  if (wired.has(bot)) return;
  wired.add(bot);

  bot.onAction([ACTION_APPROVE, ACTION_DENY], (event) => handleAction(event, getInbox()));
  bot.onModalSubmit(MODAL_CALLBACK, (event) => handleModalSubmit(event, getInbox()));
}

function reviewerFrom(user: ActionEvent["user"] | undefined): Reviewer | undefined {
  if (!user) return undefined;
  return { id: user.userId, name: user.fullName };
}

async function handleAction(event: ActionEvent, inbox: HitlInbox): Promise<void> {
  const requestId = event.value;
  if (!requestId) return;
  const by = reviewerFrom(event.user);

  if (event.actionId === ACTION_DENY) {
    await inbox.deny(requestId, { by });
    return;
  }

  // Approve: collect feedback through a modal when the approval has fields
  // (chat cards cannot hold inline inputs), otherwise resolve immediately.
  const record = await inbox.get(requestId);
  const fields = record?.fields ?? {};
  if (needsModal(fields)) {
    await event.openModal(approvalModal(requestId, fields));
    return;
  }
  await inbox.approve(requestId, { by });
}

async function handleModalSubmit(event: ModalSubmitEvent, inbox: HitlInbox): Promise<void> {
  const requestId = parseRequestId(event.privateMetadata);
  if (!requestId) return;
  const by = reviewerFrom(event.user);

  const record = await inbox.get(requestId);
  const fields = record?.fields ?? {};
  const feedbacks = parseModalValues(fields, event.values);
  await inbox.approve(requestId, {
    feedbacks: Object.keys(feedbacks).length > 0 ? feedbacks : undefined,
    by,
  });
}

function parseRequestId(privateMetadata: string | undefined): string | undefined {
  if (!privateMetadata) return undefined;
  try {
    const parsed = JSON.parse(privateMetadata) as { requestId?: string };
    return parsed.requestId;
  } catch {
    return undefined;
  }
}
