import { parseDuration, type Duration } from "./duration";
import type { ReminderEntry, ReminderTiming, Weekday } from "./reminder";

export interface FireEvent {
  /** Milliseconds from the schedule anchor. */
  atMs: number;
  entry: ReminderEntry;
}

const WEEKDAY_INDEX: Record<Weekday, number> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
};

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: Weekday;
}

export function resolveTimezone(tz?: string): string {
  if (tz) return tz;
  if (process.env.TZ) return process.env.TZ;
  const hostTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return hostTz || "UTC";
}

export function expandReminderSchedule(
  entries: ReminderEntry[],
  anchor: Date,
  timeoutMs?: number,
): FireEvent[] {
  const fires: FireEvent[] = [];

  for (const [index, entry] of entries.entries()) {
    const timingFires = expandTiming(entry.timing, anchor, timeoutMs);
    for (const atMs of timingFires) {
      fires.push({ atMs, entry, _index: index } as FireEvent & { _index: number });
    }
  }

  return fires
    .sort((a, b) => {
      const aIdx = (a as FireEvent & { _index: number })._index;
      const bIdx = (b as FireEvent & { _index: number })._index;
      return a.atMs - b.atMs || aIdx - bIdx;
    })
    .map(({ atMs, entry }) => ({ atMs, entry }));
}

function expandTiming(timing: ReminderTiming, anchor: Date, timeoutMs?: number): number[] {
  switch (timing.kind) {
    case "delay":
      return clipFireTimes([parseDuration(timing.after)], timeoutMs);
    case "at":
      return clipFireTimes(
        [resolveAtFireMs(anchor, timing.clock, timing.tz, timing.dayOffset, timing.skip)],
        timeoutMs,
      );
    case "every":
      return clipFireTimes(expandEveryFires(anchor, timing, timeoutMs), timeoutMs);
  }
}

function clipFireTimes(times: number[], timeoutMs?: number): number[] {
  const positive = times.filter((ms) => ms >= 0);
  if (timeoutMs === undefined) return positive;
  return positive.filter((ms) => ms < timeoutMs);
}

function expandEveryFires(
  anchor: Date,
  timing: Extract<ReminderTiming, { kind: "every" }>,
  timeoutMs?: number,
): number[] {
  const intervalMs = parseDuration(timing.interval);
  const untilMs = timing.until === undefined ? undefined : parseDuration(timing.until);
  const maxMs =
    timeoutMs === undefined ? untilMs : untilMs === undefined ? timeoutMs : Math.min(untilMs, timeoutMs);

  const count = timing.count ?? Number.POSITIVE_INFINITY;
  const fires: number[] = [];

  if (timing.at !== undefined) {
    const timeZone = resolveTimezone(timing.tz);
    const { hour, minute } = parseClock(timing.at);
    let parts = getZonedParts(anchor, timeZone);

    const firstTarget = zonedLocalToUtc(
      advancePastSkip({ ...parts, hour, minute, second: 0 }, timing.skip, timeZone),
      timeZone,
    ).getTime();
    if (firstTarget <= anchor.getTime()) {
      parts = addCalendarDays(parts, 1, timeZone);
    }

    while (fires.length < count) {
      const candidate = advancePastSkip({ ...parts, hour, minute, second: 0 }, timing.skip, timeZone);
      const atMs = zonedLocalToUtc(candidate, timeZone).getTime() - anchor.getTime();
      if (maxMs !== undefined && atMs >= maxMs) break;
      if (atMs >= 0) fires.push(atMs);
      parts = addCalendarDays(parts, 1, timeZone);
    }
    return fires;
  }

  for (let i = 1; fires.length < count; i++) {
    const atMs = intervalMs * i;
    if (maxMs !== undefined && atMs >= maxMs) break;
    fires.push(atMs);
  }

  return fires;
}

function resolveAtFireMs(
  anchor: Date,
  clock: string,
  tz?: string,
  dayOffset = 0,
  skip?: Weekday[],
): number {
  const timeZone = resolveTimezone(tz);
  const { hour, minute } = parseClock(clock);
  let parts = getZonedParts(anchor, timeZone);

  if (dayOffset > 0) {
    parts = addCalendarDays(parts, dayOffset, timeZone);
  } else {
    const targetToday = zonedLocalToUtc(
      advancePastSkip({ ...parts, hour, minute, second: 0 }, skip, timeZone),
      timeZone,
    ).getTime();
    if (targetToday > anchor.getTime()) {
      return targetToday - anchor.getTime();
    }
    parts = addCalendarDays(parts, 1, timeZone);
  }

  const target = zonedLocalToUtc(
    advancePastSkip({ ...parts, hour, minute, second: 0 }, skip, timeZone),
    timeZone,
  );
  return target.getTime() - anchor.getTime();
}

function parseClock(clock: string): { hour: number; minute: number } {
  const match = /^(\d{1,2}):(\d{2})$/.exec(clock);
  if (!match) {
    throw new Error(`Invalid clock time: "${clock}" (expected e.g. "07:00")`);
  }
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) {
    throw new Error(`Invalid clock time: "${clock}"`);
  }
  return { hour, minute };
}

function getZonedParts(date: Date, timeZone: string): ZonedParts {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);

  const weekdayRaw = parts.find((part) => part.type === "weekday")?.value?.toLowerCase().slice(0, 3) ?? "mon";
  const weekday = (Object.keys(WEEKDAY_INDEX) as Weekday[]).find((day) => day.startsWith(weekdayRaw)) ?? "mon";

  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    hour: read("hour") % 24,
    minute: read("minute"),
    second: read("second"),
    weekday,
  };
}

function zonedLocalToUtc(local: ZonedParts, timeZone: string): Date {
  let utc = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second, 0);
  for (let i = 0; i < 4; i++) {
    const seen = getZonedParts(new Date(utc), timeZone);
    const desired = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second, 0);
    const actual = Date.UTC(seen.year, seen.month - 1, seen.day, seen.hour, seen.minute, seen.second, 0);
    utc += desired - actual;
  }
  return new Date(utc);
}

function addCalendarDays(parts: ZonedParts, days: number, timeZone: string): ZonedParts {
  const noon = zonedLocalToUtc({ ...parts, hour: 12, minute: 0, second: 0 }, timeZone);
  const shifted = new Date(noon.getTime() + days * 86_400_000);
  const seen = getZonedParts(shifted, timeZone);
  return {
    ...seen,
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second,
  };
}

function advancePastSkip(parts: ZonedParts, skip: Weekday[] | undefined, timeZone: string): ZonedParts {
  if (!skip?.length) return parts;
  const skipSet = new Set(skip);
  let next = parts;
  let guard = 0;
  while (skipSet.has(next.weekday) && guard < 7) {
    next = addCalendarDays(next, 1, timeZone);
    guard++;
  }
  return next;
}
