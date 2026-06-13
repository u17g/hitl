import type { Duration } from "./duration";

/** Same-channel thread reminder while an approval is pending. */
export interface RemindEntry {
  after: Duration;
  message?: string;
}

/** Fallback channel notification or re-delivery while pending. */
export interface EscalateEntry {
  after: Duration;
  channel: string;
  message?: string;
  mode?: "notify" | "redeliver";
}

export type ReminderEntry = RemindEntry | EscalateEntry;

export function isEscalate(entry: ReminderEntry): entry is EscalateEntry {
  return "channel" in entry && entry.channel !== undefined;
}

export const DEFAULT_REMIND_MESSAGE = "Reminder: approval still pending";

export const DEFAULT_ESCALATE_MESSAGE = "Escalation: approval still pending";

export function remindMessage(entry: RemindEntry): string {
  return entry.message ?? DEFAULT_REMIND_MESSAGE;
}

export function escalateMessage(entry: EscalateEntry): string {
  return entry.message ?? DEFAULT_ESCALATE_MESSAGE;
}
