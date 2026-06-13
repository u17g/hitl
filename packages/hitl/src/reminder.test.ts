import { describe, expect, it } from "vitest";
import {
  DEFAULT_REMIND_MESSAGE,
  escalate,
  escalateMessage,
  isEscalate,
  remind,
  remindMessage,
} from "./reminder";

describe("reminder", () => {
  it("discriminates escalate entries by channel", () => {
    expect(isEscalate(remind.after("1h", { message: "ping" }))).toBe(false);
    expect(isEscalate(escalate.to("oncall").after("1h"))).toBe(true);
  });

  it("applies default messages", () => {
    expect(remindMessage(remind.after("1h"))).toBe(DEFAULT_REMIND_MESSAGE);
    expect(escalateMessage(escalate.to("oncall").after("1h"))).toMatch(/Escalation/);
  });

  it("builds timing entries from remind helpers", () => {
    expect(remind.after("1h")).toEqual({
      timing: { kind: "delay", after: "1h" },
    });
    expect(remind.tomorrowAt("07:00", { tz: "UTC" })).toEqual({
      timing: { kind: "at", clock: "07:00", dayOffset: 1, tz: "UTC" },
    });
    expect(remind.weekdaysAt("07:00", { for: "7d" })).toEqual({
      timing: {
        kind: "every",
        interval: "1d",
        at: "07:00",
        until: "7d",
        skip: ["sat", "sun"],
      },
    });
  });

  it("builds escalate entries from the builder", () => {
    expect(escalate.to("oncall").after("2d", { mode: "redeliver" })).toEqual({
      timing: { kind: "delay", after: "2d" },
      channel: "oncall",
      mode: "redeliver",
    });
  });
});
