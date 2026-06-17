import { describe, expect, it } from "vitest";
import { actions, field } from "@hitl-sdk/hitl/adapter";
import { encodePostback, parsePostback, POSTBACK_KIND_ACTION } from "./constants";
import { buildApprovalFlex, buildFieldStepFlex, outcomeLine } from "./render";

describe("render", () => {
  it("builds approval flex with postback buttons", () => {
    const flex = buildApprovalFlex({
      id: "req-1",
      channel: "line",
      message: "Approve deploy?",
      actions: actions().approve().deny().build(),
    });
    expect(flex.type).toBe("flex");
    expect(flex.altText).toBe("Approve deploy?");
    const bubble = flex.contents;
    expect(bubble.type).toBe("bubble");
  });

  it("builds select field step flex", () => {
    const flex = buildFieldStepFlex(
      "req-1",
      "approve",
      "tier",
      field.select({ label: "Tier", options: ["prod", "staging"] as const }),
    );
    const body = flex.contents.type === "bubble" ? flex.contents.body : undefined;
    expect(body?.contents.length).toBeGreaterThan(1);
  });

  it("summarizes resolved outcomes", () => {
    expect(outcomeLine({ type: "RESOLVED", id: "r1", actionId: "approve", externalRef: "", feedbacks: {} })).toBe(
      "Approved",
    );
  });
});

describe("postback constants", () => {
  it("round-trips postback payload", () => {
    const data = encodePostback({ k: POSTBACK_KIND_ACTION, r: "req-1", a: "approve" });
    expect(parsePostback(data)).toEqual({ k: POSTBACK_KIND_ACTION, r: "req-1", a: "approve" });
  });
});
