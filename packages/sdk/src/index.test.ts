import { describe, expect, expectTypeOf, it } from "vitest";
import { field, InMemoryStore, type ApprovalResult } from "./index";
import { createTestHitl } from "./testing";

// Test list:
// - the client's waitForApproval resolves through the built-in inbox write route
// - the result's feedbacks are typed from the field definitions
// - notify threads through the always-on web inbox channel
// - the batch loop resolves through the built-in batch submit route with typed results

describe("public API", () => {
  it("runs the full approve-with-edits loop through the inbox write route", async () => {
    const { app, client } = createTestHitl({
      store: new InMemoryStore(),
    });

    const pending = client.waitForApproval({
      message: "Send this reply?",
      fields: {
        subject: field.textField({ label: "Subject", default: "Hi" }),
        body: field.textArea({ label: "Body", default: "Hello" }),
      },
      timeout: "72h",
    });

    const requestId = await (async () => {
      for (;;) {
        const [record] = await app.store.list({ status: "pending" });
        if (record) return record.id;
        await new Promise((r) => setTimeout(r, 1));
      }
    })();

    await client.notify({ parent: requestId, message: "Original message: hello" });

    const res = await app.fetch(
      new Request(`http://x/.well-known/hitldev/v1/approvals/${requestId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          decision: "approve",
          feedbacks: { subject: "Edited subject", body: "Hello" },
          by: { name: "ryosuke" },
        }),
      }),
    );
    expect(res.status).toBe(200);

    const approval = await pending;
    expect(approval).toMatchObject({
      type: "REVIEWED",
      feedbacks: { subject: "Edited subject", body: "Hello" },
    });

    if (approval.type === "REVIEWED") {
      expectTypeOf(approval.feedbacks).toEqualTypeOf<{ subject: string; body: string }>();
    }
  });

  it("runs the batch loop through the inbox submit route with typed results", async () => {
    const { app, client } = createTestHitl({
      store: new InMemoryStore(),
    });

    const pending = client.waitForBatchApprovals({
      title: "Outbound emails",
      fields: { subject: field.textField({ label: "Subject", default: "Hi" }) },
      items: [
        { message: "Email to ACME", defaults: { subject: "Hello ACME" } },
        { message: "Email to Globex" },
      ],
      timeout: "72h",
    });

    const batchId = await (async () => {
      for (;;) {
        const [record] = await app.store.list({ status: "pending" });
        if (record?.batchId) return record.batchId;
        await new Promise((r) => setTimeout(r, 1));
      }
    })();

    const res = await app.fetch(
      new Request(`http://x/.well-known/hitldev/v1/batches/${batchId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          decisions: [
            { requestId: `${batchId}:0`, decision: "approve" },
            { requestId: `${batchId}:1`, decision: "approve", feedbacks: { subject: "Edited" } },
          ],
          by: { name: "ryosuke" },
        }),
      }),
    );
    expect(res.status).toBe(200);

    const results = await pending;
    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({ type: "APPROVED", by: { name: "ryosuke" } });
    expect(results[1]).toMatchObject({ type: "REVIEWED", feedbacks: { subject: "Edited" } });

    expectTypeOf(results).toEqualTypeOf<ApprovalResult<{ subject: string }>[]>();
  });
});
