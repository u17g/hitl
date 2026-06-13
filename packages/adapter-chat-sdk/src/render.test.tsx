import { field, actions, type HumanRequest, type HumanResult } from "hitl";
import { toCardElement, toModalElement } from "chat";
import { describe, expect, it } from "vitest";
import { actionButtonId, actionModalCallback } from "./constants";
import { humanRequestCard, actionModal, outcomeLine, resultCard } from "./render";

const request: HumanRequest = {
  id: "req-1",
  channel: "approvals",
  message: "Inbound lead: a@b.com",
  actions: actions().approve({ label: "Approve" }).deny({ label: "Deny" }).build(),
};

function actionsOf(card: ReturnType<typeof toCardElement>) {
  return card?.children.find((c) => c.type === "actions");
}

describe("humanRequestCard", () => {
  it("renders the message and Submit/Deny buttons carrying the requestId", () => {
    const card = toCardElement(humanRequestCard(request));
    expect(card?.type).toBe("card");
    expect(card?.children).toContainEqual({ type: "text", content: request.message });

    const actions = actionsOf(card);
    expect(actions).toBeDefined();
    const buttons = actions?.type === "actions" ? actions.children : [];
    expect(buttons).toContainEqual(
      expect.objectContaining({
        type: "button",
        id: actionButtonId("approve"),
        value: "req-1",
        style: "primary",
      }),
    );
    expect(buttons).toContainEqual(
      expect.objectContaining({
        type: "button",
        id: actionButtonId("deny"),
        value: "req-1",
        style: "danger",
      }),
    );
  });
});

describe("actionModal", () => {
  const fields = {
    subject: field.textField({ label: "Subject", default: "Hi" }),
    body: field.textArea({ label: "Body" }),
    tone: field.select({ label: "Tone", options: ["formal", "casual"] }),
    send: field.confirm({ label: "Send?", default: true }),
  };

  it("carries the callbackId and requestId in privateMetadata", () => {
    const modal = toModalElement(actionModal("req-1", "approve", fields));
    expect(modal?.type).toBe("modal");
    expect(modal?.callbackId).toBe(actionModalCallback("approve"));
    expect(modal?.privateMetadata).toBe(JSON.stringify({ requestId: "req-1", actionId: "approve" }));
  });

  it("renders one input per field, mapped by kind and keyed by field name", () => {
    const modal = toModalElement(actionModal("req-1", "approve", fields));
    const children = modal?.children ?? [];

    expect(children).toContainEqual(
      expect.objectContaining({ type: "text_input", id: "subject", label: "Subject", initialValue: "Hi" }),
    );
    expect(children).toContainEqual(
      expect.objectContaining({ type: "text_input", id: "body", multiline: true }),
    );
    expect(children).toContainEqual(
      expect.objectContaining({
        type: "select",
        id: "tone",
        options: [
          { label: "formal", value: "formal" },
          { label: "casual", value: "casual" },
        ],
      }),
    );
    expect(children).toContainEqual(
      expect.objectContaining({
        type: "radio_select",
        id: "send",
        initialOption: "yes",
        options: [
          { label: "Yes", value: "yes" },
          { label: "No", value: "no" },
        ],
      }),
    );
  });
});

describe("resultCard", () => {
  it("shows the message and the outcome, with no action buttons", () => {
    const result: HumanResult = {
      type: "RESOLVED",
      actionId: "approve",
      id: "req-1",
      by: { name: "Ryo" },
      feedbacks: {},
    };
    const card = toCardElement(resultCard(request.message, result));
    expect(card?.children).toContainEqual({ type: "text", content: request.message });
    expect(actionsOf(card)).toBeUndefined();
    expect(JSON.stringify(card)).toContain("Approved by Ryo");
  });
});

describe("outcomeLine", () => {
  it("describes each result type", () => {
    expect(
      outcomeLine({
        type: "RESOLVED",
        actionId: "approve",
        id: "1",
        by: { name: "Ryo" },
        feedbacks: {},
      }),
    ).toBe("Approved by Ryo");
    expect(
      outcomeLine({
        type: "RESOLVED",
        actionId: "approve",
        id: "1",
        edited: true,
        feedbacks: {},
      }),
    ).toBe("Approved with edits");
    expect(
      outcomeLine({
        type: "RESOLVED",
        actionId: "deny",
        id: "1",
        feedbacks: { reason: "nope" },
      }),
    ).toBe("Denied — nope");
    expect(outcomeLine({ type: "TIMED_OUT", id: "1" })).toBe("Timed out");
  });
});
