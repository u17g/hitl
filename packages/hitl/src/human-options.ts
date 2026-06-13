import type { Duration } from "./duration";
import type { FeedbackValues, HitlField } from "./fields";
import type { HumanActionDef } from "./human-actions";
import { validateActions } from "./human-actions";
import type { HumanResult } from "./human-result";
import type { ReminderEntry } from "./reminder";
import type { ThreadAnchor } from "./types";

type ApproveFields<Actions extends readonly HumanActionDef[]> =
  Extract<Actions[number], { id: "approve" }> extends HumanActionDef<"approve", infer F>
    ? F
    : Record<string, never>;

export interface HumanItem<Actions extends readonly HumanActionDef[]> {
  message: string;
  defaults?: Partial<FeedbackValues<ApproveFields<Actions>>>;
}

/** Options for the create phase (`requestHuman`). */
export interface RequestHumanOptions<Actions extends readonly HumanActionDef[]> {
  message?: string;
  actions: Actions;
  items?: ReadonlyArray<HumanItem<Actions>>;
  /** Batch defaults target when no approve action exists. */
  defaultsActionId?: string;
  context?: Record<string, unknown>;
  channel?: string;
  /** Post under the same chat thread as a prior human step or notify. */
  after?: HumanResult<Actions> | ThreadAnchor;
  /** Adapter-native thread ref (e.g. Chat SDK "slack:C123:ts"). Inbox ignores. */
  inThread?: string;
}

/** Options for the wait phase (`waitForHuman(pending, …)`). */
export interface HumanWaitOptions {
  timeout?: Duration;
  reminders?: ReminderEntry[];
}

export interface WaitForHumanOptions<Actions extends readonly HumanActionDef[]>
  extends RequestHumanOptions<Actions>, HumanWaitOptions {}

export function validateWaitForHumanOptions<Actions extends readonly HumanActionDef[]>(
  opts: WaitForHumanOptions<Actions>,
): void {
  validateActions(opts.actions);
  if (opts.items !== undefined) {
    if (opts.items.length === 0) {
      throw new Error("waitForHuman needs at least one item when items is provided.");
    }
    return;
  }
  if (!opts.message) {
    throw new Error("waitForHuman requires message when items is absent.");
  }
}
