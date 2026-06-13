import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { remind } from "./reminder";
import { expandReminderSchedule, resolveTimezone } from "./schedule";

describe("resolveTimezone", () => {
  const originalTz = process.env.TZ;

  afterEach(() => {
    if (originalTz === undefined) delete process.env.TZ;
    else process.env.TZ = originalTz;
  });

  it("prefers an explicit timezone", () => {
    process.env.TZ = "America/New_York";
    expect(resolveTimezone("Asia/Tokyo")).toBe("Asia/Tokyo");
  });

  it("falls back to process.env.TZ", () => {
    process.env.TZ = "Asia/Tokyo";
    expect(resolveTimezone()).toBe("Asia/Tokyo");
  });
});

describe("expandReminderSchedule", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    process.env.TZ = "UTC";
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.TZ;
  });

  it("expands legacy after entries", () => {
    vi.setSystemTime(new Date("2026-06-13T10:00:00.000Z"));
    const anchor = new Date();
    const fires = expandReminderSchedule([{ after: "1h" }], anchor);
    expect(fires).toHaveLength(1);
    expect(fires[0]!.atMs).toBe(3_600_000);
  });

  it("schedules tomorrowAt for the next calendar day", () => {
    vi.setSystemTime(new Date("2026-06-13T15:00:00.000Z"));
    const anchor = new Date();
    const fires = expandReminderSchedule([remind.tomorrowAt("07:00", { tz: "UTC" })], anchor);
    expect(fires).toHaveLength(1);
    expect(new Date(anchor.getTime() + fires[0]!.atMs).toISOString()).toBe("2026-06-14T07:00:00.000Z");
  });

  it("schedules at for later today when the clock has not passed", () => {
    vi.setSystemTime(new Date("2026-06-13T05:00:00.000Z"));
    const anchor = new Date();
    const fires = expandReminderSchedule([remind.at("07:00", { tz: "UTC" })], anchor);
    expect(fires).toHaveLength(1);
    expect(new Date(anchor.getTime() + fires[0]!.atMs).toISOString()).toBe("2026-06-13T07:00:00.000Z");
  });

  it("skips weekends for weekdaysAt", () => {
    vi.setSystemTime(new Date("2026-06-13T10:00:00.000Z")); // Saturday
    const anchor = new Date();
    const fires = expandReminderSchedule(
      [remind.weekdaysAt("07:00", { for: "7d", tz: "UTC" })],
      anchor,
    );

    const timestamps = fires.map((fire) => new Date(anchor.getTime() + fire.atMs).toISOString());
    expect(timestamps[0]).toBe("2026-06-15T07:00:00.000Z"); // Monday
    expect(timestamps.every((iso) => {
      const day = new Date(iso).getUTCDay();
      return day >= 1 && day <= 5;
    })).toBe(true);
  });

  it("clips fires after timeout", () => {
    vi.setSystemTime(new Date("2026-06-13T10:00:00.000Z"));
    const anchor = new Date();
    const fires = expandReminderSchedule(
      [remind.after("2h"), remind.after("30m")],
      anchor,
      3_600_000,
    );
    expect(fires).toHaveLength(1);
    expect(fires[0]!.atMs).toBe(1_800_000);
  });

  it("expands every with count", () => {
    vi.setSystemTime(new Date("2026-06-13T10:00:00.000Z"));
    const anchor = new Date();
    const fires = expandReminderSchedule([remind.every("1h", { count: 3 })], anchor);
    expect(fires.map((fire) => fire.atMs)).toEqual([3_600_000, 7_200_000, 10_800_000]);
  });

  it("preserves array order for same-time reminders", () => {
    vi.setSystemTime(new Date("2026-06-13T10:00:00.000Z"));
    const anchor = new Date();
    const first = remind.after("1h", { message: "first" });
    const second = remind.after("1h", { message: "second" });
    const fires = expandReminderSchedule([first, second], anchor);
    expect(fires).toHaveLength(2);
    expect(fires[0]!.entry).toBe(first);
    expect(fires[1]!.entry).toBe(second);
  });
});
