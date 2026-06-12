import { field, type ApprovalRequest, type ApprovalResult } from "@hitldev/sdk";
import { describe, expect, it } from "vitest";
import { renderApprovalCard, renderResultCard } from "./render";

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
