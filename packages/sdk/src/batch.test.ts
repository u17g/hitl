import { describe, expect, it, vi } from "vitest";
import type { EngineBinding, EngineSuspension } from "./binding";
import {
  requestBatchApprovals,
  resolveApproval,
  resolveBatchApproval,
  type BatchApprovalOptions,
  type HitlRuntime,
} from "./core";
import { field } from "./fields";
import { InMemoryStore } from "./store";
import type {
  ApprovalRequest,
  ApprovalResult,
  BatchApprovalRequest,
  HitlPlugin,
  Notification,
} from "./types";

// Test list:
// - delivers the batch as one message via sendBatch; records batch + item records with merged defaults
// - falls back to per-item send when the plugin has no sendBatch
// - falls back to per-item send when canSendBatch returns false
// - throws on empty items
// - one batch callback resolves every item; results come back in input order
// - per-item decisions map independently: deny+reason -> DENIED, edits -> REVIEWED, defaults -> APPROVED
// - feedbacks equal to the item's merged defaults resolve APPROVED (not REVIEWED)
// - invalid feedbacks on any item reject the whole batch and leave every item pending
// - already-resolved items are skipped on batch submit
// - throws when a pending item has no decision
// - updateBatch reflects results into the batch message; per-item update used on the fallback path
// - fallback path: items resolve one by one via resolveApproval; the batch waits for all
// - batch timeout: pending items become TIMED_OUT, resolved items keep their results
// - batch reminder threads a notify under the batch message externalId
// - escalate redeliver re-sends the batch on the fallback channel

class FakeBinding implements EngineBinding {
  waits = new Map<string, (payload: unknown) => void>();
  readonly runLabels: string[] = [];
  private counter = 0;
  private sleepResolvers: Array<() => void> = [];
  readonly sleepCalls: number[] = [];

  suspend<T>(): EngineSuspension<T> {
    const token = `tok_${++this.counter}`;
    let resolveFn!: (payload: T) => void;
    const promise = new Promise<T>((resolve) => (resolveFn = resolve));
    this.waits.set(token, resolveFn as (payload: unknown) => void);
    return { token, promise };
  }

  async resolve(token: string, payload: unknown): Promise<void> {
    const resolveFn = this.waits.get(token);
    if (!resolveFn) throw new Error(`No wait for token ${token}`);
    resolveFn(payload);
  }

  sleep = vi.fn((ms: number) => {
    this.sleepCalls.push(ms);
    return new Promise<void>((resolve) => {
      this.sleepResolvers.push(resolve);
    });
  });

  flushSleep(): void {
    const resolve = this.sleepResolvers.shift();
    resolve?.();
  }

  autoResolveSleep(): void {
    this.sleep = vi.fn(() => Promise.resolve());
  }

  async run<T>(label: string, fn: () => Promise<T>): Promise<T> {
    this.runLabels.push(label);
    return fn();
  }
}

interface FakePlugin extends HitlPlugin {
  sent: ApprovalRequest[];
  sentBatches: BatchApprovalRequest[];
  updates: unknown[][];
  batchUpdates: Array<[string, ApprovalResult[]]>;
  notifications: Notification[];
}

function fakePlugin(id: string, opts?: { batch?: boolean }): FakePlugin {
  const sent: ApprovalRequest[] = [];
  const sentBatches: BatchApprovalRequest[] = [];
  const updates: unknown[][] = [];
  const batchUpdates: Array<[string, ApprovalResult[]]> = [];
  const notifications: Notification[] = [];
  const plugin: FakePlugin = {
    id,
    sent,
    sentBatches,
    updates,
    batchUpdates,
    notifications,
    async send(request) {
      sent.push(request);
      return { externalId: `ext_${request.id}` };
    },
    async update(externalId, result) {
      updates.push([externalId, result]);
    },
    async notify(notification) {
      notifications.push(notification);
    },
  };
  if (opts?.batch !== false) {
    plugin.sendBatch = async (request) => {
      sentBatches.push(request);
      return { externalId: `bext_${request.batchId}` };
    };
    plugin.updateBatch = async (externalId, results) => {
      batchUpdates.push([externalId, results]);
    };
  }
  return plugin;
}

function makeRuntime(plugins: FakePlugin[]) {
  const binding = new FakeBinding();
  const store = new InMemoryStore();
  const runtime: HitlRuntime = { binding, store, plugins };
  return { binding, store, plugins, runtime };
}

const fields = {
  subject: field.textField({ label: "Subject", default: "Hi" }),
  body: field.textArea({ label: "Body", default: "Hello there" }),
};

function emailBatch(): BatchApprovalOptions<typeof fields> {
  return {
    title: "Outbound emails",
    fields,
    items: [
      { message: "Email to ACME", defaults: { subject: "Hello ACME" } },
      { message: "Email to Globex" },
    ],
  };
}

async function startBatch(
  runtime: HitlRuntime,
  plugin: FakePlugin,
  opts: BatchApprovalOptions<typeof fields> = emailBatch(),
): Promise<{ pending: Promise<ApprovalResult[]>; batchId: string }> {
  const pending = requestBatchApprovals(runtime, opts);
  await vi.waitFor(() => expect(plugin.sentBatches.length + plugin.sent.length).toBeGreaterThan(0));
  const batchId =
    plugin.sentBatches[0]?.batchId ?? plugin.sent[0]!.id.slice(0, plugin.sent[0]!.id.indexOf(":"));
  return { pending, batchId };
}

describe("requestBatchApprovals", () => {
  it("delivers the batch as one message and records batch + items with merged defaults", async () => {
    const { runtime, store, plugins } = makeRuntime([fakePlugin("a")]);

    const { pending, batchId } = await startBatch(runtime, plugins[0]!);

    expect(plugins[0]!.sentBatches).toHaveLength(1);
    expect(plugins[0]!.sent).toHaveLength(0);
    const request = plugins[0]!.sentBatches[0]!;
    expect(request).toMatchObject({
      channel: "a",
      title: "Outbound emails",
      fields,
      items: [
        {
          id: `${batchId}:0`,
          message: "Email to ACME",
          defaults: { subject: "Hello ACME", body: "Hello there" },
        },
        {
          id: `${batchId}:1`,
          message: "Email to Globex",
          defaults: { subject: "Hi", body: "Hello there" },
        },
      ],
    });

    const batch = await store.getBatch(batchId);
    expect(batch?.externalId).toBe(`bext_${batchId}`);

    const items = await store.listByBatch(batchId);
    expect(items.map((r) => r.id)).toEqual([`${batchId}:0`, `${batchId}:1`]);
    expect(items[0]!.fields.subject).toMatchObject({ kind: "text", default: "Hello ACME" });
    expect(items[1]!.fields.subject).toMatchObject({ kind: "text", default: "Hi" });
    expect(items.every((r) => r.status === "pending")).toBe(true);

    await resolveBatchApproval(runtime, {
      batchId,
      decisions: items.map((r) => ({ requestId: r.id, decision: "approve" as const })),
    });
    await pending;
  });

  it("falls back to per-item send when the plugin has no sendBatch", async () => {
    const { runtime, store, plugins } = makeRuntime([fakePlugin("a", { batch: false })]);

    const { pending, batchId } = await startBatch(runtime, plugins[0]!);

    expect(plugins[0]!.sent).toHaveLength(2);
    expect(plugins[0]!.sent.map((r) => r.id)).toEqual([`${batchId}:0`, `${batchId}:1`]);
    expect((await store.get(`${batchId}:0`))?.externalId).toBe(`ext_${batchId}:0`);
    expect((await store.getBatch(batchId))?.externalId).toBeUndefined();

    await resolveApproval(runtime, { requestId: `${batchId}:0`, decision: "approve" });
    await resolveApproval(runtime, { requestId: `${batchId}:1`, decision: "approve" });
    await pending;
  });

  it("falls back to per-item send when canSendBatch returns false", async () => {
    const plugin = fakePlugin("a");
    plugin.canSendBatch = () => false;
    const { runtime, plugins } = makeRuntime([plugin]);

    const { pending, batchId } = await startBatch(runtime, plugins[0]!);

    expect(plugins[0]!.sentBatches).toHaveLength(0);
    expect(plugins[0]!.sent).toHaveLength(2);

    await resolveApproval(runtime, { requestId: `${batchId}:0`, decision: "approve" });
    await resolveApproval(runtime, { requestId: `${batchId}:1`, decision: "approve" });
    await pending;
  });

  it("throws on empty items", async () => {
    const { runtime } = makeRuntime([fakePlugin("a")]);
    await expect(
      requestBatchApprovals(runtime, { items: [] }),
    ).rejects.toThrow(/at least one item/i);
  });

  it("fallback path resolves items one by one and the batch waits for all", async () => {
    const { runtime, plugins } = makeRuntime([fakePlugin("a", { batch: false })]);
    const { pending, batchId } = await startBatch(runtime, plugins[0]!);

    await resolveApproval(runtime, { requestId: `${batchId}:1`, decision: "deny", reason: "no" });

    let settled = false;
    void pending.then(() => (settled = true));
    await new Promise((r) => setTimeout(r, 10));
    expect(settled).toBe(false);

    await resolveApproval(runtime, { requestId: `${batchId}:0`, decision: "approve" });

    const results = await pending;
    expect(results).toEqual([
      { type: "APPROVED", id: `${batchId}:0` },
      { type: "DENIED", id: `${batchId}:1`, reason: "no" },
    ]);
  });
});

describe("resolveBatchApproval", () => {
  it("one submit resolves every item; results come back in input order", async () => {
    const { runtime, plugins } = makeRuntime([fakePlugin("a")]);
    const { pending, batchId } = await startBatch(runtime, plugins[0]!);

    const results = await resolveBatchApproval(runtime, {
      batchId,
      by: { name: "ryosuke" },
      decisions: [
        { requestId: `${batchId}:1`, decision: "approve" },
        { requestId: `${batchId}:0`, decision: "approve" },
      ],
    });

    expect(results).toEqual([
      { type: "APPROVED", id: `${batchId}:0`, by: { name: "ryosuke" } },
      { type: "APPROVED", id: `${batchId}:1`, by: { name: "ryosuke" } },
    ]);
    expect(await pending).toEqual(results);
  });

  it("maps per-item decisions independently", async () => {
    const { runtime, plugins } = makeRuntime([fakePlugin("a")]);
    const opts = {
      fields,
      items: [
        { message: "approve me" },
        { message: "deny me" },
        { message: "edit me", defaults: { subject: "Prefilled" } },
      ],
    };
    const { pending, batchId } = await startBatch(runtime, plugins[0]!, opts);

    const results = await resolveBatchApproval(runtime, {
      batchId,
      decisions: [
        // feedbacks equal to merged defaults -> APPROVED
        { requestId: `${batchId}:0`, decision: "approve", feedbacks: { subject: "Hi" } },
        { requestId: `${batchId}:1`, decision: "deny", reason: "spam" },
        // edited away from the item's merged default -> REVIEWED
        { requestId: `${batchId}:2`, decision: "approve", feedbacks: { subject: "Edited" } },
      ],
    });

    expect(results.map((r) => r.type)).toEqual(["APPROVED", "DENIED", "REVIEWED"]);
    expect(results[1]).toMatchObject({ reason: "spam" });
    expect(results[2]).toMatchObject({
      feedbacks: { subject: "Edited", body: "Hello there" },
    });
    await pending;
  });

  it("rejects invalid feedbacks and leaves every item pending", async () => {
    const { runtime, store, plugins } = makeRuntime([fakePlugin("a")]);
    const { batchId } = await startBatch(runtime, plugins[0]!);

    await expect(
      resolveBatchApproval(runtime, {
        batchId,
        decisions: [
          { requestId: `${batchId}:0`, decision: "approve" },
          { requestId: `${batchId}:1`, decision: "approve", feedbacks: { bogus: "x" } },
        ],
      }),
    ).rejects.toThrow(/bogus/);

    const items = await store.listByBatch(batchId);
    expect(items.every((r) => r.status === "pending")).toBe(true);
  });

  it("skips already-resolved items on batch submit", async () => {
    const { runtime, plugins } = makeRuntime([fakePlugin("a", { batch: false })]);
    const { pending, batchId } = await startBatch(runtime, plugins[0]!);

    await resolveApproval(runtime, { requestId: `${batchId}:0`, decision: "deny", reason: "no" });

    const results = await resolveBatchApproval(runtime, {
      batchId,
      decisions: [
        { requestId: `${batchId}:0`, decision: "approve" },
        { requestId: `${batchId}:1`, decision: "approve" },
      ],
    });

    expect(results[0]).toEqual({ type: "DENIED", id: `${batchId}:0`, reason: "no" });
    expect(results[1]).toMatchObject({ type: "APPROVED" });
    await pending;
  });

  it("throws when a pending item has no decision", async () => {
    const { runtime, store, plugins } = makeRuntime([fakePlugin("a")]);
    const { batchId } = await startBatch(runtime, plugins[0]!);

    await expect(
      resolveBatchApproval(runtime, {
        batchId,
        decisions: [{ requestId: `${batchId}:0`, decision: "approve" }],
      }),
    ).rejects.toThrow(/missing decision/i);

    const items = await store.listByBatch(batchId);
    expect(items.every((r) => r.status === "pending")).toBe(true);
  });

  it("throws on an unknown batch id", async () => {
    const { runtime } = makeRuntime([fakePlugin("a")]);
    await expect(
      resolveBatchApproval(runtime, { batchId: "missing", decisions: [] }),
    ).rejects.toThrow(/missing/);
  });

  it("reflects results into the batch message via updateBatch", async () => {
    const { runtime, plugins } = makeRuntime([fakePlugin("a")]);
    const { pending, batchId } = await startBatch(runtime, plugins[0]!);

    const results = await resolveBatchApproval(runtime, {
      batchId,
      decisions: [
        { requestId: `${batchId}:0`, decision: "approve" },
        { requestId: `${batchId}:1`, decision: "approve" },
      ],
    });
    await pending;

    expect(plugins[0]!.batchUpdates).toEqual([[`bext_${batchId}`, results]]);
    expect(plugins[0]!.updates).toHaveLength(0);
  });

  it("uses per-item update on the fallback path", async () => {
    const { runtime, plugins } = makeRuntime([fakePlugin("a", { batch: false })]);
    const { pending, batchId } = await startBatch(runtime, plugins[0]!);

    const results = await resolveBatchApproval(runtime, {
      batchId,
      decisions: [
        { requestId: `${batchId}:0`, decision: "approve" },
        { requestId: `${batchId}:1`, decision: "approve" },
      ],
    });
    await pending;

    expect(plugins[0]!.updates).toEqual([
      [`ext_${batchId}:0`, results[0]],
      [`ext_${batchId}:1`, results[1]],
    ]);
  });
});

describe("batch timeout and reminders", () => {
  it("times out pending items and keeps resolved ones", async () => {
    const plugin = fakePlugin("a");
    const { runtime, store, plugins } = makeRuntime([plugin]);

    const pending = requestBatchApprovals(runtime, {
      ...emailBatch(),
      timeout: "1h",
    });
    await vi.waitFor(() => expect(plugin.sentBatches).toHaveLength(1));
    const batchId = plugin.sentBatches[0]!.batchId;

    await resolveApproval(runtime, { requestId: `${batchId}:0`, decision: "approve" });

    (runtime.binding as FakeBinding).flushSleep();
    const results = await pending;

    expect(results[0]).toMatchObject({ type: "APPROVED", id: `${batchId}:0` });
    expect(results[1]).toEqual({ type: "TIMED_OUT", id: `${batchId}:1` });
    expect((await store.get(`${batchId}:1`))?.status).toBe("resolved");
    expect(plugins[0]!.batchUpdates).toEqual([[`bext_${batchId}`, results]]);
  });

  it("threads a reminder notify under the batch message", async () => {
    const plugin = fakePlugin("a");
    const { runtime, binding, plugins } = makeRuntime([plugin]);

    const pending = requestBatchApprovals(runtime, {
      ...emailBatch(),
      reminder: [{ after: "1h", message: "Still waiting" }],
    });
    await vi.waitFor(() => expect(plugin.sentBatches).toHaveLength(1));
    const batchId = plugin.sentBatches[0]!.batchId;

    expect(binding.sleepCalls).toEqual([3_600_000]);
    binding.flushSleep();

    await vi.waitFor(() => expect(plugins[0]!.notifications).toHaveLength(1));
    expect(plugins[0]!.notifications[0]).toEqual({
      parent: batchId,
      message: "Still waiting",
      channel: "a",
      parentExternalId: `bext_${batchId}`,
    });

    await resolveBatchApproval(runtime, {
      batchId,
      decisions: [
        { requestId: `${batchId}:0`, decision: "approve" },
        { requestId: `${batchId}:1`, decision: "approve" },
      ],
    });
    await pending;
  });

  it("skips the reminder after the whole batch is resolved", async () => {
    const plugin = fakePlugin("a");
    const { runtime, binding, plugins } = makeRuntime([plugin]);

    const pending = requestBatchApprovals(runtime, {
      ...emailBatch(),
      reminder: [{ after: "1h", message: "ping" }],
    });
    await vi.waitFor(() => expect(plugin.sentBatches).toHaveLength(1));
    const batchId = plugin.sentBatches[0]!.batchId;

    await resolveBatchApproval(runtime, {
      batchId,
      decisions: [
        { requestId: `${batchId}:0`, decision: "approve" },
        { requestId: `${batchId}:1`, decision: "approve" },
      ],
    });
    await pending;

    binding.flushSleep();
    expect(plugins[0]!.notifications).toHaveLength(0);
  });

  it("escalates with redeliver of the whole batch on the fallback channel", async () => {
    const primary = fakePlugin("primary");
    const oncall = fakePlugin("oncall");
    const { runtime, binding, store } = makeRuntime([primary, oncall]);

    const pending = requestBatchApprovals(runtime, {
      ...emailBatch(),
      channel: "primary",
      reminder: [{ after: "1h", channel: "oncall", mode: "redeliver" }],
    });
    await vi.waitFor(() => expect(primary.sentBatches).toHaveLength(1));
    const batchId = primary.sentBatches[0]!.batchId;

    binding.flushSleep();
    await vi.waitFor(() => expect(oncall.sentBatches).toHaveLength(1));
    expect(oncall.sentBatches[0]).toMatchObject({ batchId, channel: "oncall" });
    expect((await store.getBatch(batchId))?.externalIds?.oncall).toBe(`bext_${batchId}`);

    await resolveBatchApproval(runtime, {
      batchId,
      decisions: [
        { requestId: `${batchId}:0`, decision: "approve" },
        { requestId: `${batchId}:1`, decision: "approve" },
      ],
    });
    const results = await pending;

    expect(primary.batchUpdates).toEqual([[`bext_${batchId}`, results]]);
    expect(oncall.batchUpdates).toEqual([[`bext_${batchId}`, results]]);
  });
});
