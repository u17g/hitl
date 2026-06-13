import { InMemoryState } from "hitl";
import { createTestHitl } from "hitl/testing";
import { describe, expect, it } from "vitest";

describe("hello-world smoke", () => {
  it("runs the approve loop used by workflows/hello.ts", async () => {
    const { app, client } = createTestHitl({
      state: new InMemoryState(),
    });

    const pending = client.waitForApproval({ message: "Say hello to world?" });

    const record = await (async () => {
      for (;;) {
        const [item] = await app.state.list({ status: "pending" });
        if (item) return item;
        await new Promise((r) => setTimeout(r, 1));
      }
    })();
    expect(record.message).toBe("Say hello to world?");

    await app.inbox.approve(record.id, { by: { name: "you" } });

    await expect(pending).resolves.toMatchObject({ type: "APPROVED" });
  });
});
