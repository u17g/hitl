import { describe, expect, it } from "vitest";
import { field } from "./fields";
import type { ApprovalRequest, BatchApprovalRequest } from "./types";
import { webui } from "./webui";

// Test list:
// - default id is "webui"; a custom id is honored
// - send is a no-op delivery: the inbox reads from the store, externalId = request id
// - sendBatch is a no-op delivery: externalId = batch id
// - handleCallback parses POST <base>/webui/approvals/:id  (approve with feedbacks / deny with reason)
// - handleCallback parses POST <base>/webui/batches/:batchId into a batch callback
// - handleCallback ignores requests for other paths
// - works end-to-end through createHitl (see create-hitl tests for dispatch mechanics)

const request: ApprovalRequest = {
  id: "req-1",
  channel: "webui",
  message: "Approve?",
  fields: { subject: field.textField({ label: "Subject" }) },
};

const batchRequest: BatchApprovalRequest = {
  batchId: "batch-1",
  channel: "webui",
  title: "Outbound emails",
  fields: { subject: field.textField({ label: "Subject", default: "Hi" }) },
  items: [
    { id: "batch-1:0", message: "Email A", defaults: { subject: "Hello A" } },
    { id: "batch-1:1", message: "Email B", defaults: { subject: "Hi" } },
  ],
};

describe("webui plugin", () => {
  it("defaults its id to webui and honors a custom id", () => {
    expect(webui().id).toBe("webui");
    expect(webui({ id: "inbox" }).id).toBe("inbox");
  });

  it("send returns the request id as externalId", async () => {
    expect(await webui().send(request)).toEqual({ externalId: "req-1" });
  });

  it("parses an approve callback with feedbacks", async () => {
    const plugin = webui();
    const callback = await plugin.handleCallback!(
      new Request("http://x/hitl/webui/approvals/req-1", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          decision: "approve",
          feedbacks: { subject: "Edited" },
          by: { name: "ryosuke" },
        }),
      }),
    );

    expect(callback).toEqual({
      requestId: "req-1",
      decision: "approve",
      feedbacks: { subject: "Edited" },
      by: { name: "ryosuke" },
      reason: undefined,
    });
  });

  it("parses a deny callback with a reason", async () => {
    const plugin = webui();
    const callback = await plugin.handleCallback!(
      new Request("http://x/hitl/webui/approvals/req-1", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision: "deny", reason: "spam" }),
      }),
    );

    expect(callback).toMatchObject({ requestId: "req-1", decision: "deny", reason: "spam" });
  });

  it("sendBatch returns the batch id as externalId", async () => {
    expect(await webui().sendBatch!(batchRequest)).toEqual({ externalId: "batch-1" });
  });

  it("parses a batch submit callback", async () => {
    const plugin = webui();
    const callback = await plugin.handleCallback!(
      new Request("http://x/hitl/webui/batches/batch-1", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          decisions: [
            { requestId: "batch-1:0", decision: "approve", feedbacks: { subject: "Edited" } },
            { requestId: "batch-1:1", decision: "deny", reason: "no" },
          ],
          by: { name: "ryosuke" },
        }),
      }),
    );

    expect(callback).toEqual({
      batchId: "batch-1",
      decisions: [
        { requestId: "batch-1:0", decision: "approve", feedbacks: { subject: "Edited" } },
        { requestId: "batch-1:1", decision: "deny", reason: "no" },
      ],
      by: { name: "ryosuke" },
    });
  });

  it("ignores requests for other paths", async () => {
    const plugin = webui();
    const callback = await plugin.handleCallback!(
      new Request("http://x/hitl/slack/callback", {
        method: "POST",
        body: JSON.stringify({ decision: "approve" }),
      }),
    );
    expect(callback).toBeNull();
  });

  it("uses its custom id as the path segment", async () => {
    const plugin = webui({ id: "inbox" });
    const callback = await plugin.handleCallback!(
      new Request("http://x/hitl/inbox/approvals/req-9", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision: "approve" }),
      }),
    );
    expect(callback).toMatchObject({ requestId: "req-9", decision: "approve" });
  });
});
