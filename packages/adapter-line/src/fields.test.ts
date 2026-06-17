import { describe, expect, it } from "vitest";
import { field } from "@hitl-sdk/hitl/adapter";
import { canUseInlineFlex, needsFeedbackStep, needsLiff } from "./fields";

describe("fields", () => {
  it("detects when feedback is needed", () => {
    expect(needsFeedbackStep({})).toBe(false);
    expect(needsFeedbackStep({ reason: field.textField({ label: "Reason" }) })).toBe(true);
  });

  it("allows inline flex for single select or confirm", () => {
    expect(canUseInlineFlex({ tier: field.select({ label: "Tier", options: ["a", "b"] as const }) })).toBe(
      true,
    );
    expect(canUseInlineFlex({ ok: field.confirm({ label: "OK?" }) })).toBe(true);
  });

  it("requires LIFF for text fields or multiple fields", () => {
    const text = { reason: field.textField({ label: "Reason" }) };
    expect(needsLiff(text)).toBe(true);
    expect(
      needsLiff({
        a: field.select({ label: "A", options: ["x"] as const }),
        b: field.confirm({ label: "B" }),
      }),
    ).toBe(true);
  });
});
