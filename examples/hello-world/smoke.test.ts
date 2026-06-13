import { InMemoryStore } from "@hitldev/sdk";
import { createTestHitl } from "@hitldev/sdk/testing";
import { describe, expect, it } from "vitest";

describe("hello-world smoke", () => {
  it("runs the approve loop used by workflows/hello.ts", async () => {
    const { app, client } = createTestHitl({
      store: new InMemoryStore(),
    });

    const pending = client.waitForApproval({ message: "Say hello to world?" });

    const record = await (async () => {
      for (;;) {
        const [item] = await app.store.list({ status: "pending" });
        if (item) return item;
        await new Promise((r) => setTimeout(r, 1));
      }
    })();
    expect(record.message).toBe("Say hello to world?");

    const res = await app.fetch(
      new Request(`http://x/.well-known/hitldev/v1/approvals/${record.id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision: "approve", by: { name: "you" } }),
      }),
    );
    expect(res.status).toBe(200);

    await expect(pending).resolves.toMatchObject({ type: "APPROVED" });
  });
});
