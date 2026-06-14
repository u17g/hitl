import type { FeedbackValues } from "./fields";
import type { HumanActionDef } from "./human-actions";
import type { Reviewer } from "./types";

type ResolvedResult<Actions extends readonly HumanActionDef[]> = {
  [K in keyof Actions]: Actions[K] extends HumanActionDef<infer Id, infer F>
    ? {
        type: "RESOLVED";
        actionId: Id;
        id: string;
        externalRef: string;
        by?: Reviewer;
        feedbacks: FeedbackValues<F>;
        /** Present when this action had fields and the reviewer changed defaults. */
        edited?: boolean;
      }
    : never;
}[number];

export type HumanResult<
  Actions extends readonly HumanActionDef[] = readonly HumanActionDef[],
> =
  | { type: "TIMED_OUT"; id: string; externalRef: string }
  | ResolvedResult<Actions>;

export function isResolved<
  Actions extends readonly HumanActionDef[],
  const Id extends Actions[number]["id"],
>(
  result: HumanResult<Actions>,
  actionId: Id,
): result is Extract<HumanResult<Actions>, { actionId: Id }> {
  return result.type === "RESOLVED" && result.actionId === actionId;
}
