import { describe, expect, expectTypeOf, it } from "vitest";
import { field, actions, type HumanResult } from "./index";
import { InMemoryState } from "./state";
import { createTestHitl } from "./testing";

// Test list:
// - the client's waitForHuman resolves through hitl.inbox
// - the result's feedbacks are typed from the field definitions
// - requestHuman → notify → waitForHuman(pending) while still pending
// - the batch loop resolves through hitl.inbox.resolveBatch with typed results

const approvalActions = actions()
  .approve({
    fields: {
      subject: field.textField({ label: "Subject", default: "Hi" }),
      body: field.textArea({ label: "Body", default: "Hello" }),
    },
  })
  .build();

const batchActions = actions()
  .approve({ fields: { subject: field.textField({ label: "Subject", default: "Hi" }) } })
  .build();

describe("public API", () => {
  it("runs the full approve-with-edits loop through hitl.inbox", async () => {
    const { hitl, client } = createTestHitl({
      state: new InMemoryState(),
    });

    const pending = client.waitForHuman({
      message: "Send this reply?",
      actions: approvalActions,
      timeout: "72h",
    });

    const requestId = await (async () => {
      for (;;) {
        const [record] = (await hitl.state.list({ status: "pending" })).items;
        if (record) return record.id;
        await new Promise((r) => setTimeout(r, 1));
      }
    })();

    await client.notify({ on: requestId, message: "Original message: hello" });

    await hitl.inbox.resolve(requestId, {
      actionId: "approve",
      feedbacks: { subject: "Edited subject", body: "Hello" },
      by: { name: "ryosuke" },
    });

    const approval = await pending;
    expect(approval).toMatchObject({
      type: "RESOLVED",
      actionId: "approve",
      feedbacks: { subject: "Edited subject", body: "Hello" },
      edited: true,
    });

    if (approval.type === "RESOLVED" && approval.actionId === "approve") {
      expectTypeOf(approval.feedbacks).toEqualTypeOf<{ subject: string; body: string }>();
    }
  });

  it("notifies while pending via requestHuman then waitForHuman(pending)", async () => {
    const { hitl, client } = createTestHitl({
      state: new InMemoryState(),
    });

    const pending = await client.requestHuman({
      message: "Send this reply?",
      actions: approvalActions,
    });

    await client.notify({
      after: pending,
      message: "Original message: hello",
      detail: { source: "inbox" },
    });

    await hitl.inbox.resolve(pending.id, {
      actionId: "approve",
      feedbacks: { subject: "Edited subject", body: "Hello" },
      by: { name: "ryosuke" },
    });

    const approval = await client.waitForHuman(pending, { timeout: "72h" });
    expect(approval).toMatchObject({
      type: "RESOLVED",
      actionId: "approve",
      feedbacks: { subject: "Edited subject", body: "Hello" },
      edited: true,
    });
  });

  it("runs the batch loop through hitl.inbox.resolveBatch with typed results", async () => {
    const { hitl, client } = createTestHitl({
      state: new InMemoryState(),
    });

    const pending = client.waitForHuman({
      message: "Outbound emails",
      actions: batchActions,
      items: [
        { message: "Email to ACME", defaults: { subject: "Hello ACME" } },
        { message: "Email to Globex" },
      ],
      timeout: "72h",
    });

    const batchId = await (async () => {
      for (;;) {
        const [record] = (await hitl.state.list({ status: "pending" })).items;
        if (record?.batchId) return record.batchId;
        await new Promise((r) => setTimeout(r, 1));
      }
    })();

    await hitl.inbox.resolveBatch(
      batchId,
      [
        { requestId: `${batchId}:0`, actionId: "approve" },
        { requestId: `${batchId}:1`, actionId: "approve", feedbacks: { subject: "Edited" } },
      ],
      { by: { name: "ryosuke" } },
    );

    const results = await pending;
    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({
      type: "RESOLVED",
      actionId: "approve",
      by: { name: "ryosuke" },
    });
    expect(results[0]).not.toHaveProperty("edited");
    expect(results[1]).toMatchObject({
      type: "RESOLVED",
      actionId: "approve",
      feedbacks: { subject: "Edited" },
      edited: true,
    });

    expectTypeOf(results).toEqualTypeOf<HumanResult<typeof batchActions>[]>();
  });
});
