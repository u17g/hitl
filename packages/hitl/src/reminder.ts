import type { Duration } from "./duration";

export type Weekday = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

export const WEEKEND_DAYS: readonly Weekday[] = ["sat", "sun"];

/** Wall-clock time: `"07:00"` or `"7:00"`. */
export type ClockTime = `${number}:${number}` | `${number}:${number}${number}` | string;

export type ReminderTiming =
  | { kind: "delay"; after: Duration }
  | { kind: "at"; clock: string; dayOffset?: number; tz?: string; skip?: Weekday[] }
  | {
      kind: "every";
      interval: Duration;
      at?: string;
      count?: number;
      until?: Duration;
      tz?: string;
      skip?: Weekday[];
    };

/** Same-channel thread reminder while an approval is pending. */
export interface RemindEntry {
  timing: ReminderTiming;
  message?: string;
}

/** Fallback channel notification or re-delivery while pending. */
export interface EscalateEntry {
  timing: ReminderTiming;
  channel: string;
  message?: string;
  mode?: "notify" | "redeliver";
}

export type ReminderEntry = RemindEntry | EscalateEntry;

export interface ReminderCommonOpts {
  message?: string;
  tz?: string;
  skip?: Weekday[];
}

export interface EveryReminderOpts extends ReminderCommonOpts {
  at?: ClockTime;
  count?: number;
  for?: Duration;
  until?: Duration;
}

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

function delayTiming(after: Duration): ReminderTiming {
  return { kind: "delay", after };
}

function atTiming(clock: ClockTime, opts?: ReminderCommonOpts & { dayOffset?: number }): ReminderTiming {
  return {
    kind: "at",
    clock,
    dayOffset: opts?.dayOffset,
    tz: opts?.tz,
    skip: opts?.skip,
  };
}

function everyTiming(interval: Duration, opts: EveryReminderOpts): ReminderTiming {
  const until = opts.for ?? opts.until;
  return {
    kind: "every",
    interval,
    at: opts.at,
    count: opts.count,
    until,
    tz: opts?.tz,
    skip: opts?.skip,
  };
}

export const remind = {
  after(after: Duration, opts?: { message?: string }): RemindEntry {
    return { timing: delayTiming(after), message: opts?.message };
  },

  at(clock: ClockTime, opts?: ReminderCommonOpts & { message?: string }): RemindEntry {
    return { timing: atTiming(clock, opts), message: opts?.message };
  },

  tomorrowAt(clock: ClockTime, opts?: ReminderCommonOpts & { message?: string }): RemindEntry {
    return { timing: atTiming(clock, { ...opts, dayOffset: 1 }), message: opts?.message };
  },

  every(interval: Duration, opts: EveryReminderOpts & { message?: string }): RemindEntry {
    return { timing: everyTiming(interval, opts), message: opts.message };
  },

  dailyAt(clock: ClockTime, opts?: EveryReminderOpts & { message?: string }): RemindEntry {
    return { timing: everyTiming("1d", { ...opts, at: clock }), message: opts?.message };
  },

  weekdaysAt(clock: ClockTime, opts?: EveryReminderOpts & { message?: string }): RemindEntry {
    return {
      timing: everyTiming("1d", { ...opts, at: clock, skip: opts?.skip ?? [...WEEKEND_DAYS] }),
      message: opts?.message,
    };
  },
};

class EscalateBuilder {
  constructor(private readonly channel: string) {}

  after(after: Duration, opts?: { message?: string; mode?: "notify" | "redeliver" }): EscalateEntry {
    return { timing: delayTiming(after), channel: this.channel, ...opts };
  }

  at(clock: ClockTime, opts?: ReminderCommonOpts & { message?: string; mode?: "notify" | "redeliver" }): EscalateEntry {
    return { timing: atTiming(clock, opts), channel: this.channel, message: opts?.message, mode: opts?.mode };
  }

  tomorrowAt(
    clock: ClockTime,
    opts?: ReminderCommonOpts & { message?: string; mode?: "notify" | "redeliver" },
  ): EscalateEntry {
    return {
      timing: atTiming(clock, { ...opts, dayOffset: 1 }),
      channel: this.channel,
      message: opts?.message,
      mode: opts?.mode,
    };
  }

  every(
    interval: Duration,
    opts: EveryReminderOpts & { message?: string; mode?: "notify" | "redeliver" },
  ): EscalateEntry {
    return { timing: everyTiming(interval, opts), channel: this.channel, message: opts.message, mode: opts.mode };
  }

  dailyAt(
    clock: ClockTime,
    opts?: EveryReminderOpts & { message?: string; mode?: "notify" | "redeliver" },
  ): EscalateEntry {
    return {
      timing: everyTiming("1d", { ...opts, at: clock }),
      channel: this.channel,
      message: opts?.message,
      mode: opts?.mode,
    };
  }

  weekdaysAt(
    clock: ClockTime,
    opts?: EveryReminderOpts & { message?: string; mode?: "notify" | "redeliver" },
  ): EscalateEntry {
    return {
      timing: everyTiming("1d", { ...opts, at: clock, skip: opts?.skip ?? [...WEEKEND_DAYS] }),
      channel: this.channel,
      message: opts?.message,
      mode: opts?.mode,
    };
  }
}

export const escalate = {
  to(channel: string): EscalateBuilder {
    return new EscalateBuilder(channel);
  },
};
