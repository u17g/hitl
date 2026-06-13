import { field, actions } from "@hitl-sdk/hitl";
import { InMemoryState } from "@hitl-sdk/hitl/state";
import { createTestHitl } from "@hitl-sdk/hitl/testing";
import { describe, expect, it } from "vitest";

const approvalActions = actions()
  .approve({ label: "Approve" })
  .deny({
    label: "Deny",
    fields: { reason: field.textArea({ label: "Reason" }) },
  })
  .build();

describe("hello-world smoke", () => {
  it("runs the approve loop used by workflows/hello.ts", async () => {
    const { hitl, client } = createTestHitl({
      state: new InMemoryState(),
    });

    const pending = client.waitForHuman({
      message: "Say hello to world?",
      actions: approvalActions,
    });

    const record = await (async () => {
      for (;;) {
        const [item] = await hitl.state.list({ status: "pending" });
        if (item) return item;
        await new Promise((r) => setTimeout(r, 1));
      }
    })();
    expect(record.message).toBe("Say hello to world?");
    expect(record.actions.map((a) => a.id)).toEqual(["approve", "deny"]);

    await hitl.inbox.resolve(record.id, { actionId: "approve", by: { name: "you" } });

    await expect(pending).resolves.toMatchObject({ type: "RESOLVED", actionId: "approve" });
  });
});
