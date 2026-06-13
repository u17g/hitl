import { DatabaseSync } from "node:sqlite";
import { field, type HitlPlugin } from "@hitldev/sdk";
import { createTestHitl } from "@hitldev/sdk/testing";
import { describe, expect, it, vi } from "vitest";
import { SqliteStore } from "./index";

function jsonPlugin(id: string): HitlPlugin {
  return {
    id,
    async send(request) {
      return { externalId: `ext_${request.id}` };
    },
    async notify() {},
  };
}

describe("createHitl with SqliteStore", () => {
  it("persists the approve round-trip in sqlite", async () => {
    const db = new DatabaseSync(":memory:");
    const { app, client } = createTestHitl({
      store: new SqliteStore(db),
      plugins: [jsonPlugin("a")],
    });

    const promise = client.waitForApproval({
      message: "Approve?",
      fields: { subject: field.textField({ label: "Subject", default: "Hi" }) },
    });
    const requestId = await vi.waitFor(async () => {
      const [record] = await app.store.list({ status: "pending" });
      expect(record).toBeTruthy();
      return record!.id;
    });

    const pending = await app.inbox.list({ status: "pending" });
    expect(pending.map((a) => a.id)).toEqual([requestId]);

    await app.inbox.approve(requestId);
    expect(await promise).toMatchObject({ type: "APPROVED", id: requestId });

    const fresh = new SqliteStore(db);
    expect(await fresh.get(requestId)).toMatchObject({
      status: "resolved",
      externalId: `ext_${requestId}`,
      result: { type: "APPROVED", id: requestId },
    });
  });
});
