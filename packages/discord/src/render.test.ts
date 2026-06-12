import { field, type ApprovalRequest, type BatchApprovalRequest } from "@hitldev/sdk";
import { describe, expect, it } from "vitest";
import {
  approveCustomId,
  batchSelectCustomId,
  batchSubmitCustomId,
  denyCustomId,
  modalCustomId,
  parseModalFeedbacks,
  renderApprovalMessage,
  renderApprovalModal,
  renderBatchMessage,
  renderBatchResultMessage,
  renderResultMessage,
} from "./render";

const request: ApprovalRequest = {
  id: "req-1",
  channel: "lead-approvals",
  message: "Inbound lead: a@b.com",
  fields: {
    subject: field.textField({ label: "Subject", default: "Hi" }),
    notes: field.textArea({ label: "Notes" }),
    tier: field.select({ label: "Tier", options: ["A", "B"] as const }),
    urgent: field.confirm({ label: "Urgent?", default: false }),
  },
};

describe("renderApprovalMessage", () => {
  it("includes embed description and approve/deny buttons", () => {
    const msg = renderApprovalMessage(request);
    expect(msg.embeds[0]?.description).toBe(request.message);
    const row = msg.components[0] as unknown as { components: { custom_id: string }[] };
    expect(row.components.map((b) => b.custom_id)).toEqual([
      approveCustomId("req-1"),
      denyCustomId("req-1"),
    ]);
  });
});

describe("renderApprovalModal", () => {
  it("maps each field to a modal text input row", () => {
    const modal = renderApprovalModal("req-1", request.fields);
    expect(modal.custom_id).toBe(modalCustomId("req-1"));
    expect(modal.components).toHaveLength(4);
  });
});

describe("renderResultMessage", () => {
  it("shows outcome in the embed footer", () => {
    const msg = renderResultMessage("Hello", {
      type: "APPROVED",
      id: "req-1",
      by: { name: "alice" },
    });
    expect(msg.embeds[0]?.footer?.text).toBe("Approved by alice");
    expect(msg.components).toEqual([]);
  });
});

const batchRequest: BatchApprovalRequest = {
  batchId: "b1",
  channel: "lead-approvals",
  title: "Outbound emails",
  fields: {},
  items: [
    { id: "b1:0", message: "Email to ACME", defaults: {} },
    { id: "b1:1", message: "Email to Globex", defaults: {} },
  ],
};

describe("renderBatchMessage", () => {
  const msg = renderBatchMessage(batchRequest);

  it("lists the items in the embed", () => {
    const description = msg.embeds[0]?.description ?? "";
    expect(description).toContain("Outbound emails");
    expect(description).toContain("Email to ACME");
    expect(description).toContain("Email to Globex");
  });

  it("renders a multi select with every item preselected (approve)", () => {
    const row = msg.components[0] as unknown as {
      components: {
        type: number;
        custom_id: string;
        min_values: number;
        max_values: number;
        options: { value: string; default?: boolean }[];
      }[];
    };
    const select = row.components[0]!;
    expect(select.type).toBe(3);
    expect(select.custom_id).toBe(batchSelectCustomId("b1"));
    expect(select.min_values).toBe(0);
    expect(select.max_values).toBe(2);
    expect(select.options.map((o) => o.value)).toEqual(["b1:0", "b1:1"]);
    expect(select.options.every((o) => o.default === true)).toBe(true);
  });

  it("renders a submit button carrying the batch id", () => {
    const row = msg.components[1] as unknown as {
      components: { custom_id: string; label: string }[];
    };
    expect(row.components).toEqual([
      expect.objectContaining({ custom_id: batchSubmitCustomId("b1"), label: "Submit" }),
    ]);
  });
});

describe("renderBatchResultMessage", () => {
  it("shows each item with its outcome and no components", () => {
    const msg = renderBatchResultMessage(batchRequest, [
      { type: "APPROVED", id: "b1:0", by: { name: "alice" } },
      { type: "DENIED", id: "b1:1", reason: "spam" },
    ]);
    const description = msg.embeds[0]?.description ?? "";
    expect(description).toContain("Email to ACME");
    expect(description).toContain("Approved by alice");
    expect(description).toContain("spam");
    expect(msg.components).toEqual([]);
  });
});

describe("parseModalFeedbacks", () => {
  it("extracts typed feedback values from modal components", () => {
    const feedbacks = parseModalFeedbacks(request.fields, [
      {
        components: [
          { custom_id: "field:subject", value: "Updated" },
          { custom_id: "field:notes", value: "Some notes" },
          { custom_id: "field:tier", value: "A" },
          { custom_id: "field:urgent", value: "yes" },
        ],
      },
    ]);
    expect(feedbacks).toEqual({
      subject: "Updated",
      notes: "Some notes",
      tier: "A",
      urgent: true,
    });
  });
});
