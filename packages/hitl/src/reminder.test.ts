import { describe, expect, it } from "vitest";
import {
  DEFAULT_REMIND_MESSAGE,
  escalateMessage,
  isEscalate,
  remindMessage,
} from "./reminder";

describe("reminder", () => {
  it("discriminates escalate entries by channel", () => {
    expect(isEscalate({ after: "1h", message: "ping" })).toBe(false);
    expect(isEscalate({ after: "1h", channel: "oncall" })).toBe(true);
  });

  it("applies default messages", () => {
    expect(remindMessage({ after: "1h" })).toBe(DEFAULT_REMIND_MESSAGE);
    expect(escalateMessage({ after: "1h", channel: "oncall" })).toMatch(/Escalation/);
  });
});
