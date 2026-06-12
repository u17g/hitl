import { DatabaseSync } from "node:sqlite";
import { describe, expect, it, vi } from "vitest";
import {
  createHitl,
  hitl,
  waitForApproval,
  type EngineBinding,
  type EngineSuspension,
  type HitlCallback,
  type HitlPlugin,
} from "@openhitl/sdk";
import { SqliteStore } from "./index";

class FakeBinding implements EngineBinding {
  private waits = new Map<string, (payload: unknown) => void>();
  private counter = 0;

  suspend<T>(): EngineSuspension<T> {
    const token = `tok_${++this.counter}`;
    let resolveFn!: (payload: T) => void;
    const promise = new Promise<T>((resolve) => (resolveFn = resolve));
    this.waits.set(token, resolveFn as (payload: unknown) => void);
    return { token, promise };
  }

  async resolve(token: string, payload: unknown): Promise<void> {
    this.waits.get(token)?.(payload);
  }

  async sleep(): Promise<void> {}

  async run<T>(_label: string, fn: () => Promise<T>): Promise<T> {
    return fn();
  }
}

function jsonPlugin(id: string): HitlPlugin {
  return {
    id,
    async send(request) {
      return { externalId: `ext_${request.id}` };
    },
    async notify() {},
    async handleCallback(req): Promise<HitlCallback | null> {
      const body = (await req.clone().json()) as Record<string, unknown>;
      if (body.pluginId !== id) return null;
      return {
        requestId: body.requestId as string,
        decision: body.decision as "approve" | "deny",
        feedbacks: body.feedbacks as Record<string, unknown> | undefined,
      };
    },
  };
}

describe("createHitl with SqliteStore", () => {
  it("persists the approve round-trip in sqlite", async () => {
    const db = new DatabaseSync(":memory:");
    const app = createHitl({
      store: new SqliteStore(db),
      plugins: [jsonPlugin("a")],
      binding: new FakeBinding(),
    });

    const promise = waitForApproval({
      message: "Approve?",
      feedbacks: { subject: hitl.textField({ label: "Subject", default: "Hi" }) },
    });
    const requestId = await vi.waitFor(async () => {
      const [record] = await app.store.list({ status: "pending" });
      expect(record).toBeTruthy();
      return record!.id;
    });

    const inbox = await app.fetch(new Request("http://x/hitl/approvals?status=pending"));
    expect(inbox.status).toBe(200);
    const body = (await inbox.json()) as { approvals: { id: string }[] };
    expect(body.approvals.map((a) => a.id)).toEqual([requestId]);

    const callback = await app.fetch(
      new Request("http://x/hitl/callback", {
        method: "POST",
        body: JSON.stringify({ pluginId: "a", requestId, decision: "approve" }),
      }),
    );
    expect(callback.status).toBe(200);
    expect(await promise).toMatchObject({ type: "APPROVED", id: requestId });

    // The outcome survives outside the app: a fresh store over the same
    // database sees the resolved record.
    const fresh = new SqliteStore(db);
    expect(await fresh.get(requestId)).toMatchObject({
      status: "resolved",
      externalId: `ext_${requestId}`,
      result: { type: "APPROVED", id: requestId },
    });
  });
});
