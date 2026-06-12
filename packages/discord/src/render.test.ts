import { field, type ApprovalRequest } from "@hitldev/sdk";
import { describe, expect, it } from "vitest";
import {
  approveCustomId,
  denyCustomId,
  modalCustomId,
  parseModalFeedbacks,
  renderApprovalMessage,
  renderApprovalModal,
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
