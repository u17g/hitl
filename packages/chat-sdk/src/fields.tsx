/** @jsxImportSource chat */
import type { HitlField } from "@hitldev/sdk";
import { RadioSelect, Select, SelectOption, TextInput } from "chat";
import { CONFIRM_NO, CONFIRM_YES } from "./constants";

/**
 * Whether an approval needs the modal feedback step. Chat SDK cards cannot hold
 * inline text inputs, so any field at all is collected through a modal opened on
 * the approve click (matching the Discord two-step flow across every platform).
 */
export function needsModal(fields: Record<string, HitlField>): boolean {
  return Object.keys(fields).length > 0;
}

/** Modal input elements for a field set, keyed by field name (read back via `event.values`). */
export function fieldInputs(fields: Record<string, HitlField>) {
  return Object.entries(fields).map(([key, field]) => fieldInput(key, field));
}

function fieldInput(key: string, field: HitlField) {
  switch (field.kind) {
    case "text":
      return <TextInput key={key} id={key} label={field.label} optional initialValue={field.default} />;
    case "textarea":
      return (
        <TextInput key={key} id={key} label={field.label} multiline optional initialValue={field.default} />
      );
    case "select":
      return (
        <Select key={key} id={key} label={field.label} optional initialOption={field.default}>
          {field.options.map((option) => (
            <SelectOption key={option} label={option} value={option} />
          ))}
        </Select>
      );
    case "confirm":
      return (
        <RadioSelect
          key={key}
          id={key}
          label={field.label}
          optional
          initialOption={field.default === undefined ? undefined : field.default ? CONFIRM_YES : CONFIRM_NO}
        >
          <SelectOption label="Yes" value={CONFIRM_YES} />
          <SelectOption label="No" value={CONFIRM_NO} />
        </RadioSelect>
      );
  }
}

/** Map raw modal `event.values` (keyed by field name) into typed feedbacks. */
export function parseModalValues(
  fields: Record<string, HitlField>,
  values: Record<string, string>,
): Record<string, unknown> {
  const feedbacks: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(fields)) {
    const raw = values[key];
    if (raw === undefined) continue;
    feedbacks[key] = parseFieldValue(field, raw);
  }
  return feedbacks;
}

/** Coerce one raw modal value to its field type (confirm yes/no → boolean). */
export function parseFieldValue(field: HitlField, raw: string): unknown {
  if (field.kind === "confirm") {
    const normalized = raw.trim().toLowerCase();
    if (normalized === CONFIRM_YES || normalized === "true") return true;
    if (normalized === CONFIRM_NO || normalized === "false") return false;
    return raw;
  }
  return raw;
}
