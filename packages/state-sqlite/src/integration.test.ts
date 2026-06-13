import { DatabaseSync } from "node:sqlite";
import { field, type HitlPlugin } from "hitl";
import { createTestHitl } from "hitl/testing";
import { describe, expect, it, vi } from "vitest";
import { SqliteState } from "./index";

function jsonPlugin(id: string): HitlPlugin {
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
      plugins: [jsonPlugin("a")],
    });

    const promise = client.waitForApproval({
      message: "Approve?",
      fields: { subject: field.textField({ label: "Subject", default: "Hi" }) },
    });
    const requestId = await vi.waitFor(async () => {
      const [record] = await hitl.state.list({ status: "pending" });
      expect(record).toBeTruthy();
      return record!.id;
    });

    const pending = await hitl.inbox.list({ status: "pending" });
    expect(pending.map((a) => a.id)).toEqual([requestId]);

    await hitl.inbox.approve(requestId);
    expect(await promise).toMatchObject({ type: "APPROVED", id: requestId });

    const fresh = new SqliteState(db);
    expect(await fresh.get(requestId)).toMatchObject({
      status: "resolved",
      externalId: `ext_${requestId}`,
      result: { type: "APPROVED", id: requestId },
    });
  });
});
