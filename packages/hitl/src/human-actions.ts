import type { HitlField } from "./fields";

export type ActionStyle = "primary" | "danger" | "default";

export interface HumanActionDef<
  Id extends string = string,
  F extends Record<string, HitlField> = Record<string, HitlField>,
> {
  id: Id;
  label?: string;
  style?: ActionStyle;
  fields?: F;
}

/** Ordered list — index 0 renders first (left / top). */
export type HumanActions = readonly HumanActionDef[];

export function actionFields(def: HumanActionDef): Record<string, HitlField> {
  return def.fields ?? {};
}

export function actionById(actions: HumanActions, id: string): HumanActionDef | undefined {
  return actions.find((a) => a.id === id);
}

export function submitAction(actions: HumanActions): HumanActionDef | undefined {
  return actionById(actions, "submit");
}

export function denyAction(actions: HumanActions): HumanActionDef | undefined {
  return actionById(actions, "deny");
}

/** Effective submit field schema (empty when submit action is absent or has no fields). */
export function submitFields(actions: HumanActions): Record<string, HitlField> {
  const def = submitAction(actions);
  return def ? actionFields(def) : {};
}

/** Effective deny field schema (empty when deny action is absent or has no fields). */
export function denyFields(actions: HumanActions): Record<string, HitlField> {
  const def = denyAction(actions);
  return def ? actionFields(def) : {};
}

export function defaultStyle(id: string): ActionStyle {
  if (id === "submit") return "primary";
  if (id === "deny") return "danger";
  return "default";
}

export function effectiveStyle(def: HumanActionDef): ActionStyle {
  return def.style ?? defaultStyle(def.id);
}

/** Lightweight helper for tuple inference with `as const`. */
export function action<Id extends string, F extends Record<string, HitlField> = Record<string, never>>(
  id: Id,
  opts?: { label?: string; style?: ActionStyle; fields?: F },
): HumanActionDef<Id, F> {
  return { id, ...opts };
}

export function validateActions(actions: HumanActions): void {
  if (actions.length < 1) {
    throw new Error("waitForHuman requires at least one action.");
  }
  const ids = new Set<string>();
  for (const def of actions) {
    if (ids.has(def.id)) {
      throw new Error(`Duplicate action id "${def.id}".`);
    }
    ids.add(def.id);
  }
}

/** Legacy object shape stored before actions-array migration. */
interface LegacyHumanActionsObject {
  submit?: Omit<HumanActionDef, "id">;
  deny?: Omit<HumanActionDef, "id">;
}

/** Normalize persisted or legacy wire shapes into an ordered actions array. */
export function normalizeActions(raw: unknown, legacyFields?: Record<string, unknown>): HumanActions {
  if (Array.isArray(raw)) {
    return raw as HumanActions;
  }
  if (raw && typeof raw === "object") {
    const legacy = raw as LegacyHumanActionsObject;
    const actions: HumanActionDef[] = [];
    if (legacy.submit) actions.push({ id: "submit", ...legacy.submit });
    if (legacy.deny) actions.push({ id: "deny", ...legacy.deny });
    if (actions.length > 0) return actions;
  }
  if (legacyFields && Object.keys(legacyFields).length > 0) {
    return [{ id: "submit", fields: legacyFields as Record<string, HitlField> }];
  }
  return [{ id: "submit" }];
}

/** Resolve which action receives per-item defaults in batch mode. */
export function defaultsActionId(
  actions: HumanActions,
  explicit?: string,
): string {
  if (explicit !== undefined) {
    if (!actionById(actions, explicit)) {
      throw new Error(`defaultsActionId "${explicit}" not found in actions.`);
    }
    return explicit;
  }
  if (submitAction(actions)) return "submit";
  throw new Error(
    "waitForHuman batch items require a submit action or defaultsActionId.",
  );
}
