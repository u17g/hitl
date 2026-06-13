/** Stable action/callback ids shared by the renderer and the handler registry. */

const HITL_PREFIX = "hitl:";

/** Button actionId for an action click; the requestId rides in the button value. */
export function actionButtonId(actionId: string): string {
  return `${HITL_PREFIX}${actionId}`;
}

/** Parse action id from a button actionId. */
export function parseActionButtonId(buttonId: string): string | undefined {
  if (!buttonId.startsWith(HITL_PREFIX)) return undefined;
  return buttonId.slice(HITL_PREFIX.length);
}

/** Modal callbackId for an action's feedback form. */
export function actionModalCallback(actionId: string): string {
  return `${HITL_PREFIX}modal:${actionId}`;
}

/** Parse action id from a modal callbackId. */
export function parseActionModalCallback(callbackId: string): string | undefined {
  const prefix = `${HITL_PREFIX}modal:`;
  if (!callbackId.startsWith(prefix)) return undefined;
  return callbackId.slice(prefix.length);
}

/** Button actionId for a batch submit; the batchId rides in the button value. */
export const ACTION_BATCH_SUBMIT = "hitl_batch_submit";

/** RadioSelect option values for a confirm field. */
export const CONFIRM_YES = "yes";
export const CONFIRM_NO = "no";
