import {
  field,
  type ApprovalRequest,
  type ApprovalResult,
  type BatchApprovalRequest,
} from "@hitldev/sdk";
import { describe, expect, it } from "vitest";
import {
  extractBatchDecisions,
  renderApprovalCard,
  renderBatchCard,
  renderBatchResultCard,
  renderResultCard,
} from "./render";

// Test list:
// - message renders as a TextBlock
// - each field kind renders as the right Adaptive Card input
// - field id encodes the field key; defaults become values
// - approve/deny actions carry the request id
// - resolved cards drop inputs and show the outcome

const request: ApprovalRequest = {
  id: "req-1",
  channel: "lead-approvals",
  message: "Inbound lead: a@b.com",
  fields: {
    subject: field.textField({ label: "Subject", default: "Hi" }),
    body: field.textArea({ label: "Body" }),
    priority: field.select({ label: "Priority", options: ["low", "high"], default: "high" }),
    ccSales: field.confirm({ label: "CC sales?", default: true }),
  },
};

describe("renderApprovalCard", () => {
  const card = renderApprovalCard(request);

  it("starts with the message as a TextBlock", () => {
    const body = card.body as { type: string; text: string }[];
    expect(body[0]).toMatchObject({
      type: "TextBlock",
      text: "Inbound lead: a@b.com",
    });
  });

  it("renders a text field with its default", () => {
    const body = card.body as { id: string; type: string; value?: string }[];
    const input = body.find((b) => b.id === "field:subject");
    expect(input).toMatchObject({ type: "Input.Text", value: "Hi" });
  });

  it("renders a textarea as multiline without default", () => {
    const body = card.body as { id: string; isMultiline?: boolean; value?: string }[];
    const input = body.find((b) => b.id === "field:body");
    expect(input).toMatchObject({ isMultiline: true });
    expect(input?.value).toBeUndefined();
  });

  it("renders a select with choices and default", () => {
    const body = card.body as {
      id: string;
      choices?: { value: string }[];
      value?: string;
    }[];
    const input = body.find((b) => b.id === "field:priority");
    expect(input?.choices?.map((c) => c.value)).toEqual(["low", "high"]);
    expect(input?.value).toBe("high");
  });

  it("renders a confirm as Yes/No choices", () => {
    const body = card.body as { id: string; choices?: { value: string }[]; value?: string }[];
    const input = body.find((b) => b.id === "field:ccSales");
    expect(input?.choices?.map((c) => c.value)).toEqual(["true", "false"]);
    expect(input?.value).toBe("true");
  });

  it("ends with approve and deny actions carrying the request id", () => {
    const actions = card.actions as { title: string; data: Record<string, string> }[];
    expect(actions).toEqual([
      expect.objectContaining({
        title: "Approve",
        data: { hitldev_action: "approve", requestId: "req-1" },
      }),
      expect.objectContaining({
        title: "Deny",
        data: { hitldev_action: "deny", requestId: "req-1" },
      }),
    ]);
  });
});

const batchRequest: BatchApprovalRequest = {
  batchId: "b1",
  channel: "lead-approvals",
  title: "Outbound emails",
  fields: { subject: field.textField({ label: "Subject", default: "Hi" }) },
  items: [
    { id: "b1:0", message: "Email to ACME", defaults: { subject: "Hello ACME" } },
    { id: "b1:1", message: "Email to Globex", defaults: { subject: "Hi" } },
  ],
};

describe("renderBatchCard", () => {
  const card = renderBatchCard(batchRequest);
  const body = card.body as { type: string; id?: string; text?: string; value?: string }[];

  it("starts with the title", () => {
    expect(body[0]).toMatchObject({ type: "TextBlock", text: "Outbound emails" });
  });

  it("renders each item message", () => {
    const texts = body.filter((b) => b.type === "TextBlock").map((b) => b.text);
    expect(texts).toContain("Email to ACME");
    expect(texts).toContain("Email to Globex");
  });

  it("renders the shared field per item with the item's defaults", () => {
    const first = body.find((b) => b.id === "item:b1:0:field:subject");
    expect(first).toMatchObject({ type: "Input.Text", value: "Hello ACME" });
    const second = body.find((b) => b.id === "item:b1:1:field:subject");
    expect(second).toMatchObject({ value: "Hi" });
  });

  it("renders an approve/deny decision per item, defaulting to approve", () => {
    const decision = body.find((b) => b.id === "item:b1:0:decision") as
      | { choices?: { value: string }[]; value?: string }
      | undefined;
    expect(decision).toMatchObject({ type: "Input.ChoiceSet", value: "approve" });
    expect(decision?.choices?.map((c) => c.value)).toEqual(["approve", "deny"]);
  });

  it("ends with a single submit action carrying the batch id", () => {
    const actions = card.actions as { title: string; data: Record<string, string> }[];
    expect(actions).toEqual([
      expect.objectContaining({
        title: "Submit",
        data: { hitldev_action: "batch_submit", batchId: "b1" },
      }),
    ]);
  });
});

describe("renderBatchResultCard", () => {
  it("shows each item with its outcome and no inputs", () => {
    const card = renderBatchResultCard(batchRequest, [
      { type: "APPROVED", id: "b1:0", by: { name: "ryosuke" } },
      { type: "DENIED", id: "b1:1", reason: "spam" },
    ]);
    const json = JSON.stringify(card);
    expect(json).toContain("Email to ACME");
    expect(json).toContain("Approved by ryosuke");
    expect(json).toContain("spam");
    expect(json).not.toContain("Input.Text");
    expect(json).not.toContain("batch_submit");
  });
});

describe("extractBatchDecisions", () => {
  it("groups submit values into per-item decisions", () => {
    const decisions = extractBatchDecisions({
      hitldev_action: "batch_submit",
      batchId: "b1",
      "item:b1:0:decision": "approve",
      "item:b1:0:field:subject": "Edited",
      "item:b1:1:decision": "deny",
      "item:b1:1:field:subject": "Hi",
    });

    expect(decisions).toEqual(
      expect.arrayContaining([
        { requestId: "b1:0", decision: "approve", feedbacks: { subject: "Edited" } },
        { requestId: "b1:1", decision: "deny" },
      ]),
    );
    expect(decisions).toHaveLength(2);
  });
});

describe("renderResultCard", () => {
  it("shows who approved", () => {
    const result: ApprovalResult = { type: "APPROVED", id: "req-1", by: { name: "ryosuke" } };
    const card = renderResultCard(request.message, result);
    expect(JSON.stringify(card)).toContain("Approved by ryosuke");
    expect(JSON.stringify(card)).not.toContain("Input.Text");
  });

  it("shows denial with the reason", () => {
    const result: ApprovalResult = { type: "DENIED", id: "req-1", reason: "spam" };
    expect(JSON.stringify(renderResultCard(request.message, result))).toContain("spam");
  });

  it("shows timeout", () => {
    const result: ApprovalResult = { type: "TIMED_OUT", id: "req-1" };
    expect(JSON.stringify(renderResultCard(request.message, result))).toContain("Timed out");
  });
});
