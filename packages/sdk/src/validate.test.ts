import { describe, expect, it } from "vitest";
import { hitl } from "./fields";
import { validateFeedbacks } from "./validate";

// Test list:
// - text/textarea values come back as strings
// - confirm accepts boolean and "true"/"false" strings (Slack sends strings)
// - select rejects values outside options
// - missing value falls back to the field default
// - missing value without default throws
// - unknown keys are rejected
// - non-string value for a text field throws

const fields = {
  subject: hitl.textField({ label: "Subject", default: "Hi" }),
  body: hitl.textArea({ label: "Body" }),
  priority: hitl.select({ label: "Priority", options: ["low", "high"], default: "low" }),
  ccSales: hitl.confirm({ label: "CC sales?", default: false }),
};

describe("validateFeedbacks", () => {
  it("passes through valid values, typed", () => {
    const result = validateFeedbacks(fields, {
      subject: "Hello",
      body: "World",
      priority: "high",
      ccSales: true,
    });
    expect(result).toEqual({
      subject: "Hello",
      body: "World",
      priority: "high",
      ccSales: true,
    });
  });

  it("coerces confirm string values to boolean", () => {
    const result = validateFeedbacks(
      { ok: hitl.confirm({ label: "OK?" }) },
      { ok: "true" },
    );
    expect(result.ok).toBe(true);
  });

  it("rejects select values outside the options", () => {
    expect(() =>
      validateFeedbacks(fields, {
        subject: "s",
        body: "b",
        priority: "urgent",
        ccSales: false,
      }),
    ).toThrow(/priority/);
  });

  it("falls back to the field default when a value is missing", () => {
    const result = validateFeedbacks(fields, { body: "b", ccSales: false });
    expect(result.subject).toBe("Hi");
    expect(result.priority).toBe("low");
  });

  it("throws when a value is missing and there is no default", () => {
    expect(() => validateFeedbacks(fields, { ccSales: true })).toThrow(/body/);
  });

  it("rejects unknown keys", () => {
    expect(() =>
      validateFeedbacks(fields, {
        subject: "s",
        body: "b",
        priority: "low",
        ccSales: false,
        extra: "nope",
      }),
    ).toThrow(/extra/);
  });

  it("rejects non-string values for text fields", () => {
    expect(() =>
      validateFeedbacks(fields, {
        subject: 42,
        body: "b",
        priority: "low",
        ccSales: false,
      }),
    ).toThrow(/subject/);
  });
});
