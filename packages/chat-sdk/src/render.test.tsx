import { field, type ApprovalRequest, type ApprovalResult } from "hitl";
import { toCardElement, toModalElement } from "chat";
import { describe, expect, it } from "vitest";
import { ACTION_APPROVE, ACTION_DENY, MODAL_CALLBACK } from "./constants";
import { approvalCard, approvalModal, outcomeLine, resultCard } from "./render";

// Test list:
// - approvalCard: message text + Approve/Deny buttons carrying the requestId as value
// - approvalModal: modal callbackId + privateMetadata{requestId} + one input per field,
//   with text/textarea -> text_input, select -> select, confirm -> radio_select(yes/no)
// - resultCard: message + outcome line, no action buttons
// - outcomeLine: per result type, includes reviewer name

const request: ApprovalRequest = {
  id: "req-1",
  channel: "approvals",
  message: "Inbound lead: a@b.com",
  fields: {},
};

function actionsOf(card: ReturnType<typeof toCardElement>) {
  return card?.children.find((c) => c.type === "actions");
}

describe("approvalCard", () => {
  it("renders the message and Approve/Deny buttons carrying the requestId", () => {
    const card = toCardElement(approvalCard(request));
    expect(card?.type).toBe("card");
    expect(card?.children).toContainEqual({ type: "text", content: request.message });

    const actions = actionsOf(card);
    expect(actions).toBeDefined();
    const buttons = actions?.type === "actions" ? actions.children : [];
    expect(buttons).toContainEqual(
      expect.objectContaining({ type: "button", id: ACTION_APPROVE, value: "req-1", style: "primary" }),
    );
    expect(buttons).toContainEqual(
      expect.objectContaining({ type: "button", id: ACTION_DENY, value: "req-1", style: "danger" }),
    );
  });
});

describe("approvalModal", () => {
  const fields = {
    subject: field.textField({ label: "Subject", default: "Hi" }),
    body: field.textArea({ label: "Body" }),
    tone: field.select({ label: "Tone", options: ["formal", "casual"] }),
    send: field.confirm({ label: "Send?", default: true }),
  };

  it("carries the callbackId and requestId in privateMetadata", () => {
    const modal = toModalElement(approvalModal("req-1", fields));
    expect(modal?.type).toBe("modal");
    expect(modal?.callbackId).toBe(MODAL_CALLBACK);
    expect(modal?.privateMetadata).toBe(JSON.stringify({ requestId: "req-1" }));
  });

  it("renders one input per field, mapped by kind and keyed by field name", () => {
    const modal = toModalElement(approvalModal("req-1", fields));
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
    const result: ApprovalResult = { type: "APPROVED", id: "req-1", by: { name: "Ryo" } };
    const card = toCardElement(resultCard(request.message, result));
    expect(card?.children).toContainEqual({ type: "text", content: request.message });
    expect(actionsOf(card)).toBeUndefined();
    expect(JSON.stringify(card)).toContain("Approved by Ryo");
  });
});

describe("outcomeLine", () => {
  it("describes each result type", () => {
    expect(outcomeLine({ type: "APPROVED", id: "1", by: { name: "Ryo" } })).toBe("Approved by Ryo");
    expect(outcomeLine({ type: "REVIEWED", id: "1", feedbacks: {} })).toBe("Approved with edits");
    expect(outcomeLine({ type: "DENIED", id: "1", reason: "nope" })).toBe("Denied — nope");
    expect(outcomeLine({ type: "TIMED_OUT", id: "1" })).toBe("Timed out");
  });
});
