import type { HitlField } from "@hitl-sdk/hitl/adapter";
import { CONFIRM_NO, CONFIRM_YES } from "./constants";

export function needsFeedbackStep(fields: Record<string, HitlField>): boolean {
  return Object.keys(fields).length > 0;
}

/** Inline Flex can collect a single select or confirm field without LIFF. */
export function canUseInlineFlex(fields: Record<string, HitlField>): boolean {
  const entries = Object.entries(fields);
  if (entries.length !== 1) return false;
  const field = entries[0]![1];
  return field.kind === "select" || field.kind === "confirm";
}

export function needsLiff(fields: Record<string, HitlField>): boolean {
  return needsFeedbackStep(fields) && !canUseInlineFlex(fields);
}

export function parseFieldValue(field: HitlField, raw: string): unknown {
  if (field.kind === "confirm") {
    const normalized = raw.trim().toLowerCase();
    if (normalized === CONFIRM_YES || normalized === "true") return true;
    if (normalized === CONFIRM_NO || normalized === "false") return false;
    return raw;
  }
  return raw;
}

export function parsePostbackFeedbacks(
  fields: Record<string, HitlField>,
  fieldKey: string,
  rawValue: string,
): Record<string, unknown> {
  const field = fields[fieldKey];
  if (!field) return {};
  return { [fieldKey]: parseFieldValue(field, rawValue) };
}
