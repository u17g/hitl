import { DatabaseSync } from "node:sqlite";
import { field, humanActions, type HitlAdapter } from "hitl";
import { createTestHitl } from "hitl/testing";
import { describe, expect, it, vi } from "vitest";
import { SqliteState } from "./index";

function jsonAdapter(id: string): HitlAdapter {
  return {
    id,
    async send(request) {
      return { externalId: `ext_${request.id}` };
    },
    async notify() {},
  };
}

describe("Hitl with SqliteState", () => {
  it("persists the approve round-trip in sqlite", async () => {
    const db = new DatabaseSync(":memory:");
    const { hitl, client } = createTestHitl({
      state: new SqliteState(db),
      adapters: [jsonAdapter("a")],
    });

    const promise = client.waitForHuman({
      message: "Approve?",
      actions: humanActions()
        .submit({ fields: { subject: field.textField({ label: "Subject", default: "Hi" }) } })
        .build(),
    });
    const requestId = await vi.waitFor(async () => {
      const [record] = await hitl.state.list({ status: "pending" });
      expect(record).toBeTruthy();
      return record!.id;
    });

    const pending = await hitl.inbox.list({ status: "pending" });
    expect(pending.map((a) => a.id)).toEqual([requestId]);

    await hitl.inbox.resolve(requestId, { actionId: "submit" });
    expect(await promise).toMatchObject({ type: "RESOLVED", actionId: "submit", id: requestId });

    const fresh = new SqliteState(db);
    expect(await fresh.get(requestId)).toMatchObject({
      status: "resolved",
      externalId: `ext_${requestId}`,
      result: { type: "RESOLVED", actionId: "submit", id: requestId },
    });
  });
});
