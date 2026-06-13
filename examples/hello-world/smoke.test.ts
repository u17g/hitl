import { field, humanActions, InMemoryState } from "hitl";
import { createTestHitl } from "hitl/testing";
import { describe, expect, it } from "vitest";

const actions = humanActions()
  .action("submit", { label: "Approve" })
  .action("deny", {
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
      actions,
    });

    const record = await (async () => {
      for (;;) {
        const [item] = await hitl.state.list({ status: "pending" });
        if (item) return item;
        await new Promise((r) => setTimeout(r, 1));
      }
    })();
    expect(record.message).toBe("Say hello to world?");
    expect(record.actions.map((a) => a.id)).toEqual(["submit", "deny"]);

    await hitl.inbox.resolve(record.id, { actionId: "submit", by: { name: "you" } });

    await expect(pending).resolves.toMatchObject({ type: "RESOLVED", actionId: "submit" });
  });
});
