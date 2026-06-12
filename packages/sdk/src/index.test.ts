import { describe, expect, expectTypeOf, it } from "vitest";
import type { EngineBinding, EngineSuspension } from "./binding";
import {
  createHitl,
  field,
  notify,
  waitForApproval,
  waitForBatchApprovals,
  webui,
  type ApprovalResult,
} from "./index";
import { resetRuntime } from "./create-hitl";

// Test list:
// - waitForApproval suspends and resumes through a createHitl-wired app (webui callback)
// - the result's feedbacks are typed from the field definitions
// - waitForApproval before createHitl throws a configuration error
// - notify routes through the configured plugin

class ImmediateBinding implements EngineBinding {
  waits = new Map<string, (payload: unknown) => void>();
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

  // A durable timer that never fires within the test.
  sleep(): Promise<void> {
    return new Promise(() => {});
  }

  async run<T>(_label: string, fn: () => Promise<T>): Promise<T> {
    return fn();
  }
}

describe("public API", () => {
  it("throws a configuration error before createHitl is called", async () => {
    resetRuntime();
    await expect(waitForApproval({ message: "m" })).rejects.toThrow(/createHitl/);
  });

  it("runs the full approve-with-edits loop through the webui plugin", async () => {
    resetRuntime();
    const app = createHitl({ plugins: [webui()], binding: new ImmediateBinding() });

    const pending = waitForApproval({
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

    await notify({ parent: requestId, message: "Original message: hello" });

    const res = await app.fetch(
      new Request(`http://x/hitl/webui/approvals/${requestId}`, {
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

  it("runs the batch loop through the webui plugin with typed results", async () => {
    resetRuntime();
    const app = createHitl({ plugins: [webui()], binding: new ImmediateBinding() });

    const pending = waitForBatchApprovals({
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
      new Request(`http://x/hitl/webui/batches/${batchId}`, {
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
