import { describe, expect, it } from "vitest";
import {
  defaultLabel,
  effectiveActionLabel,
  effectiveCloseLabel,
  effectiveSubmitLabel,
} from "./human-actions";

describe("defaultLabel", () => {
  it("returns Approve and Deny for built-in ids", () => {
    expect(defaultLabel("approve")).toBe("Approve");
    expect(defaultLabel("deny")).toBe("Deny");
  });

  it("returns the id for custom actions", () => {
    expect(defaultLabel("escalate")).toBe("escalate");
  });
});

describe("effectiveActionLabel", () => {
  it("prefers label over the id default", () => {
    expect(effectiveActionLabel({ id: "approve", label: "Review and send" })).toBe(
      "Review and send",
    );
  });

  it("falls back to the id default", () => {
    expect(effectiveActionLabel({ id: "approve" })).toBe("Approve");
  });
});

describe("effectiveSubmitLabel", () => {
  it("prefers submitLabel, then label, then the id default", () => {
    expect(
      effectiveSubmitLabel({
        id: "approve",
        label: "Review and send",
        submitLabel: "Send now",
      }),
    ).toBe("Send now");
    expect(effectiveSubmitLabel({ id: "approve", label: "Review and send" })).toBe(
      "Review and send",
    );
    expect(effectiveSubmitLabel({ id: "approve" })).toBe("Approve");
  });
});

describe("effectiveCloseLabel", () => {
  it("prefers closeLabel and defaults to Cancel", () => {
    expect(effectiveCloseLabel({ id: "approve", closeLabel: "Go back" })).toBe("Go back");
    expect(effectiveCloseLabel({ id: "approve" })).toBe("Cancel");
  });
});
