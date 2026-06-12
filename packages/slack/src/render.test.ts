import { hitl, type ApprovalRequest, type ApprovalResult } from "@openhitl/sdk";
import { describe, expect, it } from "vitest";
import { renderApprovalBlocks, renderResultBlocks } from "./render";

// Test list:
// - message renders as a section block
// - each field kind renders as the right Block Kit input:
//   text -> plain_text_input, textarea -> multiline plain_text_input,
//   select -> static_select with options, confirm -> radio buttons Yes/No
// - block_id encodes the field key; defaults become initial values
// - approve/deny buttons carry the request id as their value
// - resolved messages drop the inputs and show the outcome

const request: ApprovalRequest = {
  id: "req-1",
  channel: "lead-approvals",
  message: "Inbound lead: a@b.com",
  fields: {
    subject: hitl.textField({ label: "Subject", default: "Hi" }),
    body: hitl.textArea({ label: "Body" }),
    priority: hitl.select({ label: "Priority", options: ["low", "high"], default: "high" }),
    ccSales: hitl.confirm({ label: "CC sales?", default: true }),
  },
};

describe("renderApprovalBlocks", () => {
  const blocks = renderApprovalBlocks(request);

  it("starts with the message as a section", () => {
    expect(blocks[0]).toMatchObject({
      type: "section",
      text: { type: "mrkdwn", text: "Inbound lead: a@b.com" },
    });
  });

  it("renders a text field as a plain_text_input with its default", () => {
    const block = blocks.find((b) => b.block_id === "field:subject");
    expect(block).toMatchObject({
      type: "input",
      label: { type: "plain_text", text: "Subject" },
      element: { type: "plain_text_input", action_id: "value", initial_value: "Hi" },
    });
  });

  it("renders a textarea as a multiline input without initial value", () => {
    const block = blocks.find((b) => b.block_id === "field:body");
    expect(block).toMatchObject({
      element: { type: "plain_text_input", multiline: true },
    });
    const element = (block as unknown as { element: { initial_value?: string } }).element;
    expect(element.initial_value).toBeUndefined();
  });

  it("renders a select as a static_select with the default preselected", () => {
    const block = blocks.find((b) => b.block_id === "field:priority");
    expect(block).toMatchObject({
      element: {
        type: "static_select",
        action_id: "value",
        initial_option: { value: "high" },
      },
    });
    const element = (block as unknown as { element: { options: { value: string }[] } }).element;
    expect(element.options.map((o) => o.value)).toEqual(["low", "high"]);
  });

  it("renders a confirm as Yes/No radio buttons", () => {
    const block = blocks.find((b) => b.block_id === "field:ccSales");
    expect(block).toMatchObject({
      element: {
        type: "radio_buttons",
        action_id: "value",
        initial_option: { value: "true" },
      },
    });
  });

  it("ends with approve and deny buttons carrying the request id", () => {
    const actions = blocks.at(-1) as {
      type: string;
      elements: { action_id: string; value: string; style?: string }[];
    };
    expect(actions.type).toBe("actions");
    expect(actions.elements).toEqual([
      expect.objectContaining({ action_id: "openhitl_approve", value: "req-1", style: "primary" }),
      expect.objectContaining({ action_id: "openhitl_deny", value: "req-1", style: "danger" }),
    ]);
  });
});

describe("renderResultBlocks", () => {
  it("shows who approved", () => {
    const result: ApprovalResult = { type: "APPROVED", id: "req-1", by: { name: "ryosuke" } };
    const blocks = renderResultBlocks(request.message, result);
    expect(JSON.stringify(blocks)).toContain("Approved by ryosuke");
    expect(JSON.stringify(blocks)).not.toContain("plain_text_input");
  });

  it("shows denial with the reason", () => {
    const result: ApprovalResult = { type: "DENIED", id: "req-1", reason: "spam" };
    expect(JSON.stringify(renderResultBlocks(request.message, result))).toContain("spam");
  });

  it("shows timeout", () => {
    const result: ApprovalResult = { type: "TIMED_OUT", id: "req-1" };
    expect(JSON.stringify(renderResultBlocks(request.message, result))).toContain("Timed out");
  });
});
