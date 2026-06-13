import { describe, expect, it, vi } from "vitest";
import type { HitlResolver, HitlSuspension } from "./binding";
import { createHitlClient, type HitlClient } from "./client";
import { resolveApproval, resolveBatchApproval } from "./core";
import { Hitl, type HitlInstance } from "./hitl";
import { field } from "./fields";
import { InMemoryState } from "./state";
import type {
  ApprovalRequest,
  ApprovalResult,
  BatchApprovalRequest,
  HitlAdapter,
  Notification,
} from "./types";

// Test list:
// - waitForApproval suspends, POSTs the resume token to /requests, and resolves on callback
// - sends the bearer secret; a 401 from the server rejects the wait
// - non-2xx responses reject (so the durable fetch step can retry)
// - timeout: sleeps for the duration, then the /timeout endpoint decides -> TIMED_OUT
// - reminder fires the /remind endpoint when the timer elapses while pending
// - reminder is a no-op (server-side) after the approval is resolved
// - reminders scheduled after the timeout are skipped client-side
// - same-time reminders fire in array order; escalate notify/redeliver pass through
// - waitForBatchApprovals: one suspension per item, one POST /batches, results in item order
// - batch timeout keeps resolved items and times out pending ones
// - notify POSTs /notifications

/** The two engine halves of the old FakeBinding: workflow-side primitives + server-side resolver. */
class FakeEngine {
  private waits = new Map<string, (payload: unknown) => void>();
  private counter = 0;
  private sleepResolvers: Array<() => void> = [];
  readonly sleepCalls: number[] = [];

  suspend = <T,>(): HitlSuspension<T> => {
    const token = `tok_${++this.counter}`;
    let resolveFn!: (payload: T) => void;
    const promise = new Promise<T>((resolve) => (resolveFn = resolve));
    this.waits.set(token, resolveFn as (payload: unknown) => void);
    return { token, promise };
  };

  sleep = vi.fn((ms: number) => {
    this.sleepCalls.push(ms);
    return new Promise<void>((resolve) => {
      this.sleepResolvers.push(resolve);
    });
  });

  flushSleep(): void {
    this.sleepResolvers.shift()?.();
  }

  autoResolveSleep(): void {
    this.sleep = vi.fn((ms: number) => {
      this.sleepCalls.push(ms);
      return Promise.resolve();
    });
  }

  resolver: HitlResolver = {
    resolve: async (token, payload) => {
      const resolveFn = this.waits.get(token);
      if (!resolveFn) throw new Error(`No wait for token ${token}`);
      resolveFn(payload);
    },
  };
}

interface FakeAdapter extends HitlAdapter {
  sent: ApprovalRequest[];
  sentBatches: BatchApprovalRequest[];
  updates: unknown[][];
  batchUpdates: Array<[string, ApprovalResult[]]>;
  notifications: Notification[];
}

function fakeAdapter(id: string, opts?: { batch?: boolean }): FakeAdapter {
  const adapter: FakeAdapter = {
    id,
    sent: [],
    sentBatches: [],
    updates: [],
    batchUpdates: [],
    notifications: [],
    async send(request) {
      adapter.sent.push(request);
      return { externalId: `ext_${request.id}` };
    },
    async update(externalId, result) {
      adapter.updates.push([externalId, result]);
    },
    async notify(notification) {
      adapter.notifications.push(notification);
    },
  };
  if (opts?.batch !== false) {
    adapter.sendBatch = async (request) => {
      adapter.sentBatches.push(request);
      return { externalId: `bext_${request.batchId}` };
    };
    adapter.updateBatch = async (externalId, results) => {
      adapter.batchUpdates.push([externalId, results]);
    };
  }
  return adapter;
}

function makeHarness(opts?: { adapterIds?: string[]; secret?: string; clientSecret?: string }) {
  const engine = new FakeEngine();
  const adapters = (opts?.adapterIds ?? ["a"]).map((id) => fakeAdapter(id));
  const hitl: HitlInstance = new Hitl({
    adapters,
    state: new InMemoryState(),
    resolver: engine.resolver,
    secret: opts?.secret,
  });
  const requestCalls: Array<{ url: string; method: string; headers: Record<string, string>; body: string }> = [];
  const client: HitlClient = createHitlClient({
    suspend: engine.suspend,
    sleep: (ms) => engine.sleep(ms),
    async request(req) {
      requestCalls.push(req);
      const res = await hitl.fetch(
        new Request(req.url, { method: req.method, headers: req.headers, body: req.body }),
      );
      return { status: res.status, ok: res.ok, body: await res.text() };
    },
    url: "http://hitl.test",
    secret: opts?.clientSecret,
  });
  return { engine, adapters, hitl, client, requestCalls };
}

const fields = {
  subject: field.textField({ label: "Subject", default: "Hi" }),
  body: field.textArea({ label: "Body", default: "Hello there" }),
};

describe("waitForApproval", () => {
  it("POSTs the resume token to /requests and resolves on callback", async () => {
    const { adapters, hitl, client, requestCalls } = makeHarness();

    const pending = client.waitForApproval({ message: "Approve?", fields });
    await vi.waitFor(() => expect(adapters[0]!.sent).toHaveLength(1));

    expect(requestCalls[0]!.url).toBe("http://hitl.test/.well-known/hitldev/v1/requests");
    const sentBody = JSON.parse(requestCalls[0]!.body) as { token: string };
    expect(sentBody.token).toBe("tok_1");

    const requestId = adapters[0]!.sent[0]!.id;
    const result = await resolveApproval(hitl.runtime, {
      requestId,
      decision: "approve",
      by: { name: "ryosuke" },
    });

    expect(await pending).toEqual(result);
    expect(result).toEqual({ type: "APPROVED", id: requestId, by: { name: "ryosuke" } });
  });

  it("typed feedbacks flow back on REVIEWED", async () => {
    const { adapters, hitl, client } = makeHarness();

    const pending = client.waitForApproval({ message: "m", fields });
    await vi.waitFor(() => expect(adapters[0]!.sent).toHaveLength(1));

    await resolveApproval(hitl.runtime, {
      requestId: adapters[0]!.sent[0]!.id,
      decision: "approve",
      feedbacks: { subject: "Edited", body: "Hello there" },
    });

    const result = await pending;
    expect(result).toMatchObject({
      type: "REVIEWED",
      feedbacks: { subject: "Edited", body: "Hello there" },
    });
  });

  it("sends the bearer secret with every API call", async () => {
    const { adapters, hitl, client, requestCalls } = makeHarness({
      secret: "s3cret",
      clientSecret: "s3cret",
    });

    const pending = client.waitForApproval({ message: "m" });
    await vi.waitFor(() => expect(adapters[0]!.sent).toHaveLength(1));

    expect(requestCalls[0]!.headers.authorization).toBe("Bearer s3cret");

    await resolveApproval(hitl.runtime, {
      requestId: adapters[0]!.sent[0]!.id,
      decision: "approve",
    });
    await pending;
  });

  it("rejects when the server returns 401", async () => {
    const { client } = makeHarness({ secret: "s3cret", clientSecret: "wrong" });
    await expect(client.waitForApproval({ message: "m" })).rejects.toThrow(/401/);
  });

  it("resolves as TIMED_OUT when the timeout elapses first", async () => {
    const { engine, adapters, hitl, client } = makeHarness();
    engine.autoResolveSleep();

    const result = await client.waitForApproval({ message: "m", timeout: "72h" });

    expect(engine.sleepCalls).toEqual([72 * 60 * 60 * 1000]);
    expect(result.type).toBe("TIMED_OUT");
    expect((await hitl.state.get(result.id))?.status).toBe("resolved");
    expect(adapters[0]!.updates).toEqual([[`ext_${result.id}`, result]]);
  });

  it("returns the callback result when it wins the race against the timeout", async () => {
    const { engine, adapters, hitl, client } = makeHarness();

    const pending = client.waitForApproval({ message: "m", timeout: "72h" });
    await vi.waitFor(() => expect(adapters[0]!.sent).toHaveLength(1));

    const result = await resolveApproval(hitl.runtime, {
      requestId: adapters[0]!.sent[0]!.id,
      decision: "approve",
    });
    expect(await pending).toEqual(result);
    void engine;
  });

  it("fires the remind endpoint when the timer elapses while pending", async () => {
    const { engine, adapters, hitl, client } = makeHarness();

    const pending = client.waitForApproval({
      message: "Approve?",
      reminder: [{ after: "1h", message: "Still waiting" }],
    });
    await vi.waitFor(() => expect(adapters[0]!.sent).toHaveLength(1));
    const requestId = adapters[0]!.sent[0]!.id;

    expect(engine.sleepCalls).toEqual([3_600_000]);
    engine.flushSleep();

    await vi.waitFor(() => expect(adapters[0]!.notifications).toHaveLength(1));
    expect(adapters[0]!.notifications[0]).toEqual({
      parent: requestId,
      message: "Still waiting",
      channel: "a",
      parentExternalId: `ext_${requestId}`,
    });

    await resolveApproval(hitl.runtime, { requestId, decision: "approve" });
    await pending;
  });

  it("skips the reminder server-side after the approval is resolved", async () => {
    const { engine, adapters, hitl, client } = makeHarness();
    const pending = client.waitForApproval({
      message: "m",
      reminder: [{ after: "1h", message: "ping" }],
    });
    await vi.waitFor(() => expect(adapters[0]!.sent).toHaveLength(1));

    await resolveApproval(hitl.runtime, {
      requestId: adapters[0]!.sent[0]!.id,
      decision: "approve",
    });
    await pending;

    engine.flushSleep();
    expect(adapters[0]!.notifications).toHaveLength(0);
  });

  it("skips reminders scheduled after the timeout", async () => {
    const { engine, adapters, client } = makeHarness();
    engine.autoResolveSleep();

    await client.waitForApproval({
      message: "m",
      timeout: "1h",
      reminder: [{ after: "2h", message: "too late" }],
    });

    expect(adapters[0]!.notifications).toHaveLength(0);
  });

  it("fires same-time reminders in array order", async () => {
    const { engine, adapters, hitl, client } = makeHarness({ adapterIds: ["a", "oncall"] });
    const pending = client.waitForApproval({
      message: "m",
      reminder: [
        { after: "1h", message: "first" },
        { after: "1h", channel: "oncall", message: "second" },
      ],
    });
    await vi.waitFor(() => expect(adapters[0]!.sent).toHaveLength(1));
    engine.flushSleep();

    await vi.waitFor(() => expect(adapters[1]!.notifications).toHaveLength(1));
    expect(adapters[0]!.notifications[0]?.message).toBe("first");
    expect(adapters[1]!.notifications[0]?.message).toBe("second");

    await resolveApproval(hitl.runtime, {
      requestId: adapters[0]!.sent[0]!.id,
      decision: "approve",
    });
    await pending;
  });

  it("escalates with redeliver on the fallback channel", async () => {
    const { engine, adapters, hitl, client } = makeHarness({ adapterIds: ["primary", "oncall"] });
    const pending = client.waitForApproval({
      message: "Escalate me",
      channel: "primary",
      fields,
      reminder: [{ after: "1h", channel: "oncall", mode: "redeliver" }],
    });
    await vi.waitFor(() => expect(adapters[0]!.sent).toHaveLength(1));
    const requestId = adapters[0]!.sent[0]!.id;
    engine.flushSleep();

    await vi.waitFor(() => expect(adapters[1]!.sent).toHaveLength(1));
    expect(adapters[1]!.sent[0]).toMatchObject({
      id: requestId,
      channel: "oncall",
      message: "Escalate me",
    });

    await resolveApproval(hitl.runtime, { requestId, decision: "approve" });
    await pending;

    expect(adapters[0]!.updates).toHaveLength(1);
    expect(adapters[1]!.updates).toHaveLength(1);
  });
});

describe("waitForBatchApprovals", () => {
  it("creates one suspension per item and resolves in item order", async () => {
    const { adapters, hitl, client, requestCalls } = makeHarness();

    const pending = client.waitForBatchApprovals({
      title: "Outbound emails",
      fields,
      items: [
        { message: "Email to ACME", defaults: { subject: "Hello ACME" } },
        { message: "Email to Globex" },
      ],
    });
    await vi.waitFor(() => expect(adapters[0]!.sentBatches).toHaveLength(1));

    const body = JSON.parse(requestCalls[0]!.body) as {
      items: Array<{ token: string; fields: typeof fields }>;
    };
    expect(body.items.map((i) => i.token)).toEqual(["tok_1", "tok_2"]);
    expect(body.items[0]!.fields.subject).toMatchObject({ default: "Hello ACME" });

    const batchId = adapters[0]!.sentBatches[0]!.batchId;
    const results = await resolveBatchApproval(hitl.runtime, {
      batchId,
      decisions: [
        { requestId: `${batchId}:0`, decision: "approve" },
        { requestId: `${batchId}:1`, decision: "deny", reason: "no" },
      ],
    });

    expect(await pending).toEqual(results);
    expect(results.map((r) => r.type)).toEqual(["APPROVED", "DENIED"]);
  });

  it("throws on empty items without suspending", async () => {
    const { client, requestCalls } = makeHarness();
    await expect(client.waitForBatchApprovals({ items: [] })).rejects.toThrow(
      /at least one item/i,
    );
    expect(requestCalls).toHaveLength(0);
  });

  it("times out pending items and keeps resolved ones", async () => {
    const { engine, adapters, hitl, client } = makeHarness();

    const pending = client.waitForBatchApprovals({
      fields,
      items: [{ message: "A" }, { message: "B" }],
      timeout: "1h",
    });
    await vi.waitFor(() => expect(adapters[0]!.sentBatches).toHaveLength(1));
    const batchId = adapters[0]!.sentBatches[0]!.batchId;

    await resolveApproval(hitl.runtime, { requestId: `${batchId}:0`, decision: "approve" });
    engine.flushSleep();

    const results = await pending;
    expect(results[0]).toMatchObject({ type: "APPROVED", id: `${batchId}:0` });
    expect(results[1]).toEqual({ type: "TIMED_OUT", id: `${batchId}:1` });
  });

  it("threads a reminder notify under the batch message", async () => {
    const { engine, adapters, hitl, client } = makeHarness();

    const pending = client.waitForBatchApprovals({
      fields,
      items: [{ message: "A" }, { message: "B" }],
      reminder: [{ after: "1h", message: "Still waiting" }],
    });
    await vi.waitFor(() => expect(adapters[0]!.sentBatches).toHaveLength(1));
    const batchId = adapters[0]!.sentBatches[0]!.batchId;

    engine.flushSleep();
    await vi.waitFor(() => expect(adapters[0]!.notifications).toHaveLength(1));
    expect(adapters[0]!.notifications[0]).toEqual({
      parent: batchId,
      message: "Still waiting",
      channel: "a",
      parentExternalId: `bext_${batchId}`,
    });

    await resolveBatchApproval(hitl.runtime, {
      batchId,
      decisions: [
        { requestId: `${batchId}:0`, decision: "approve" },
        { requestId: `${batchId}:1`, decision: "approve" },
      ],
    });
    await pending;
  });
});

describe("notify", () => {
  it("POSTs /notifications", async () => {
    const { adapters, client } = makeHarness({ adapterIds: ["a", "b"] });

    await client.notify({ message: "progress", channel: "b" });

    expect(adapters[1]!.notifications).toEqual([{ message: "progress", channel: "b" }]);
  });
});
