import type { Duration } from "./duration";
import type { FeedbackValues, HitlField } from "./fields";
import type { HumanActionDef } from "./human-actions";
import { validateActions } from "./human-actions";
import type { ReminderEntry } from "./reminder";

type SubmitFields<Actions extends readonly HumanActionDef[]> =
  Extract<Actions[number], { id: "submit" }> extends HumanActionDef<"submit", infer F>
    ? F
    : Record<string, never>;

export interface HumanItem<Actions extends readonly HumanActionDef[]> {
  message: string;
  defaults?: Partial<FeedbackValues<SubmitFields<Actions>>>;
}

export interface WaitForHumanOptions<Actions extends readonly HumanActionDef[]> {
  message?: string;
  actions: Actions;
  items?: ReadonlyArray<HumanItem<Actions>>;
  /** Batch defaults target when no submit action exists. */
  defaultsActionId?: string;
  context?: Record<string, unknown>;
  channel?: string;
  timeout?: Duration;
  reminder?: ReminderEntry[];
}

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
