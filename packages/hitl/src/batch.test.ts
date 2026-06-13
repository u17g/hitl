import { describe, expect, it } from "vitest";
import type { CreateBatchBody } from "./api-types";
import type { HitlResolver } from "./binding";
import {
  createBatchRequest,
  remindBatch,
  resolveApproval,
  resolveBatchApproval,
  timeoutBatch,
  type HitlRuntime,
} from "./core";
import { field, type HitlField } from "./fields";
import { InMemoryState } from "./state";
import type {
  ApprovalRequest,
  ApprovalResult,
  BatchApprovalRequest,
  HitlPlugin,
  Notification,
} from "./types";

// Test list:
// - createBatchRequest delivers one message via sendBatch; records batch + item records
// - falls back to per-item send when the plugin has no sendBatch / canSendBatch is false
// - throws on empty items
// - is idempotent on the first item's resume token (at-least-once fetch)
// - one batch callback resolves every item via the resolver; results in input order
// - per-item decisions map independently: deny+reason -> DENIED, edits -> REVIEWED, defaults -> APPROVED
// - invalid feedbacks on any item reject the whole batch and leave every item pending
// - already-resolved items are skipped on batch submit
// - throws when a pending item has no decision
// - updateBatch reflects results into the batch message; per-item update on the fallback path
// - timeoutBatch: pending items become TIMED_OUT, resolved items keep their results
// - remindBatch threads a notify under the batch message; no-op once all items resolved
// - remindBatch escalate redeliver re-sends the batch on the fallback channel

class FakeResolver implements HitlResolver {
  readonly resolved: Array<{ token: string; payload: unknown }> = [];

  async resolve(token: string, payload: unknown): Promise<void> {
    this.resolved.push({ token, payload });
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
  const resolver = new FakeResolver();
  const state = new InMemoryState();
  const runtime: HitlRuntime = { resolver, state, plugins };
  return { resolver, state, plugins, runtime };
}

const fields = {
  subject: field.textField({ label: "Subject", default: "Hi" }),
  body: field.textArea({ label: "Body", default: "Hello there" }),
};

function withDefault(field: HitlField, value: unknown): HitlField {
  return { ...field, default: value } as HitlField;
}

/** Two items; the first overrides the shared `subject` default — pre-merged as the client would send it. */
function emailBatch(): CreateBatchBody {
  return {
    title: "Outbound emails",
    fields,
    items: [
      {
        token: "tok_0",
        message: "Email to ACME",
        fields: { ...fields, subject: withDefault(fields.subject, "Hello ACME") },
      },
      { token: "tok_1", message: "Email to Globex", fields },
    ],
  };
}

describe("createBatchRequest", () => {
  it("delivers the batch as one message and records batch + items", async () => {
    const { runtime, state, plugins } = makeRuntime([fakePlugin("a")]);

    const { batchId, ids } = await createBatchRequest(runtime, emailBatch());

    expect(ids).toEqual([`${batchId}:0`, `${batchId}:1`]);
    expect(plugins[0]!.sentBatches).toHaveLength(1);
    expect(plugins[0]!.sent).toHaveLength(0);
    expect(plugins[0]!.sentBatches[0]).toMatchObject({
      batchId,
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

    expect((await state.getBatch(batchId))?.externalId).toBe(`bext_${batchId}`);

    const items = await state.listByBatch(batchId);
    expect(items.map((r) => r.id)).toEqual(ids);
    expect(items.map((r) => r.token)).toEqual(["tok_0", "tok_1"]);
    expect(items[0]!.fields.subject).toMatchObject({ kind: "text", default: "Hello ACME" });
    expect(items.every((r) => r.status === "pending")).toBe(true);
  });

  it("falls back to per-item send when the plugin has no sendBatch", async () => {
    const { runtime, state, plugins } = makeRuntime([fakePlugin("a", { batch: false })]);

    const { batchId, ids } = await createBatchRequest(runtime, emailBatch());

    expect(plugins[0]!.sent.map((r) => r.id)).toEqual(ids);
    expect((await state.get(`${batchId}:0`))?.externalId).toBe(`ext_${batchId}:0`);
    expect((await state.getBatch(batchId))?.externalId).toBeUndefined();
  });

  it("falls back to per-item send when canSendBatch returns false", async () => {
    const plugin = fakePlugin("a");
    plugin.canSendBatch = () => false;
    const { runtime, plugins } = makeRuntime([plugin]);

    await createBatchRequest(runtime, emailBatch());

    expect(plugins[0]!.sentBatches).toHaveLength(0);
    expect(plugins[0]!.sent).toHaveLength(2);
  });

  it("throws on empty items", async () => {
    const { runtime } = makeRuntime([fakePlugin("a")]);
    await expect(
      createBatchRequest(runtime, { fields: {}, items: [] }),
    ).rejects.toThrow(/at least one item/i);
  });

  it("returns the existing batch without re-sending when the first token is known", async () => {
    const { runtime, plugins } = makeRuntime([fakePlugin("a")]);

    const first = await createBatchRequest(runtime, emailBatch());
    const second = await createBatchRequest(runtime, emailBatch());

    expect(second).toEqual(first);
    expect(plugins[0]!.sentBatches).toHaveLength(1);
  });
});

describe("resolveBatchApproval", () => {
  it("one submit resolves every item via the resolver; results come back in input order", async () => {
    const { runtime, resolver, plugins } = makeRuntime([fakePlugin("a")]);
    const { batchId } = await createBatchRequest(runtime, emailBatch());

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
    expect(resolver.resolved).toEqual([
      { token: "tok_0", payload: results[0] },
      { token: "tok_1", payload: results[1] },
    ]);
    expect(plugins[0]!.batchUpdates).toEqual([[`bext_${batchId}`, results]]);
  });

  it("maps per-item decisions independently", async () => {
    const { runtime } = makeRuntime([fakePlugin("a")]);
    const { batchId } = await createBatchRequest(runtime, {
      fields,
      items: [
        { token: "t0", message: "approve me", fields },
        { token: "t1", message: "deny me", fields },
        {
          token: "t2",
          message: "edit me",
          fields: { ...fields, subject: withDefault(fields.subject, "Prefilled") },
        },
      ],
    });

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
  });

  it("rejects invalid feedbacks and leaves every item pending", async () => {
    const { runtime, state, resolver } = makeRuntime([fakePlugin("a")]);
    const { batchId } = await createBatchRequest(runtime, emailBatch());

    await expect(
      resolveBatchApproval(runtime, {
        batchId,
        decisions: [
          { requestId: `${batchId}:0`, decision: "approve" },
          { requestId: `${batchId}:1`, decision: "approve", feedbacks: { bogus: "x" } },
        ],
      }),
    ).rejects.toThrow(/bogus/);

    const items = await state.listByBatch(batchId);
    expect(items.every((r) => r.status === "pending")).toBe(true);
    expect(resolver.resolved).toHaveLength(0);
  });

  it("skips already-resolved items on batch submit", async () => {
    const { runtime, plugins } = makeRuntime([fakePlugin("a", { batch: false })]);
    const { batchId } = await createBatchRequest(runtime, emailBatch());

    await resolveApproval(runtime, { requestId: `${batchId}:0`, decision: "deny", reason: "no" });
    plugins[0]!.updates.length = 0;

    const results = await resolveBatchApproval(runtime, {
      batchId,
      decisions: [
        { requestId: `${batchId}:0`, decision: "approve" },
        { requestId: `${batchId}:1`, decision: "approve" },
      ],
    });

    expect(results[0]).toEqual({ type: "DENIED", id: `${batchId}:0`, reason: "no" });
    expect(results[1]).toMatchObject({ type: "APPROVED" });
  });

  it("throws when a pending item has no decision", async () => {
    const { runtime, state } = makeRuntime([fakePlugin("a")]);
    const { batchId } = await createBatchRequest(runtime, emailBatch());

    await expect(
      resolveBatchApproval(runtime, {
        batchId,
        decisions: [{ requestId: `${batchId}:0`, decision: "approve" }],
      }),
    ).rejects.toThrow(/missing decision/i);

    const items = await state.listByBatch(batchId);
    expect(items.every((r) => r.status === "pending")).toBe(true);
  });

  it("throws on an unknown batch id", async () => {
    const { runtime } = makeRuntime([fakePlugin("a")]);
    await expect(
      resolveBatchApproval(runtime, { batchId: "missing", decisions: [] }),
    ).rejects.toThrow(/missing/);
  });

  it("uses per-item update on the fallback path", async () => {
    const { runtime, plugins } = makeRuntime([fakePlugin("a", { batch: false })]);
    const { batchId } = await createBatchRequest(runtime, emailBatch());

    const results = await resolveBatchApproval(runtime, {
      batchId,
      decisions: [
        { requestId: `${batchId}:0`, decision: "approve" },
        { requestId: `${batchId}:1`, decision: "approve" },
      ],
    });

    expect(plugins[0]!.updates).toEqual([
      [`ext_${batchId}:0`, results[0]],
      [`ext_${batchId}:1`, results[1]],
    ]);
  });
});

describe("timeoutBatch", () => {
  it("times out pending items and keeps resolved ones", async () => {
    const { runtime, state, plugins } = makeRuntime([fakePlugin("a")]);
    const { batchId } = await createBatchRequest(runtime, emailBatch());

    await resolveApproval(runtime, { requestId: `${batchId}:0`, decision: "approve" });

    const results = await timeoutBatch(runtime, batchId);

    expect(results[0]).toMatchObject({ type: "APPROVED", id: `${batchId}:0` });
    expect(results[1]).toEqual({ type: "TIMED_OUT", id: `${batchId}:1` });
    expect((await state.get(`${batchId}:1`))?.status).toBe("resolved");
    expect(plugins[0]!.batchUpdates.at(-1)).toEqual([`bext_${batchId}`, results]);
  });

  it("throws on an unknown batch id", async () => {
    const { runtime } = makeRuntime([fakePlugin("a")]);
    await expect(timeoutBatch(runtime, "missing")).rejects.toThrow(/missing/);
  });
});

describe("remindBatch", () => {
  it("threads a reminder notify under the batch message", async () => {
    const { runtime, plugins } = makeRuntime([fakePlugin("a")]);
    const { batchId } = await createBatchRequest(runtime, emailBatch());

    const { pending } = await remindBatch(runtime, batchId, {
      kind: "remind",
      message: "Still waiting",
    });

    expect(pending).toBe(true);
    expect(plugins[0]!.notifications).toEqual([
      {
        parent: batchId,
        message: "Still waiting",
        channel: "a",
        parentExternalId: `bext_${batchId}`,
      },
    ]);
  });

  it("threads under the first item's message on the fallback path", async () => {
    const { runtime, plugins } = makeRuntime([fakePlugin("a", { batch: false })]);
    const { batchId } = await createBatchRequest(runtime, emailBatch());

    await remindBatch(runtime, batchId, { kind: "remind" });

    expect(plugins[0]!.notifications[0]?.parentExternalId).toBe(`ext_${batchId}:0`);
  });

  it("is a no-op once every item is resolved", async () => {
    const { runtime, plugins } = makeRuntime([fakePlugin("a")]);
    const { batchId } = await createBatchRequest(runtime, emailBatch());
    await resolveBatchApproval(runtime, {
      batchId,
      decisions: [
        { requestId: `${batchId}:0`, decision: "approve" },
        { requestId: `${batchId}:1`, decision: "approve" },
      ],
    });

    const { pending } = await remindBatch(runtime, batchId, { kind: "remind" });

    expect(pending).toBe(false);
    expect(plugins[0]!.notifications).toHaveLength(0);
  });

  it("escalates with redeliver of the whole batch on the fallback channel", async () => {
    const primary = fakePlugin("primary");
    const oncall = fakePlugin("oncall");
    const { runtime, state } = makeRuntime([primary, oncall]);
    const { batchId } = await createBatchRequest(runtime, { ...emailBatch(), channel: "primary" });

    await remindBatch(runtime, batchId, {
      kind: "escalate",
      channel: "oncall",
      mode: "redeliver",
    });

    expect(oncall.sentBatches[0]).toMatchObject({ batchId, channel: "oncall" });
    expect((await state.getBatch(batchId))?.externalIds?.oncall).toBe(`bext_${batchId}`);

    const results = await resolveBatchApproval(runtime, {
      batchId,
      decisions: [
        { requestId: `${batchId}:0`, decision: "approve" },
        { requestId: `${batchId}:1`, decision: "approve" },
      ],
    });

    expect(primary.batchUpdates).toEqual([[`bext_${batchId}`, results]]);
    expect(oncall.batchUpdates).toEqual([[`bext_${batchId}`, results]]);
  });

  it("throws on an unknown batch id", async () => {
    const { runtime } = makeRuntime([fakePlugin("a")]);
    await expect(remindBatch(runtime, "missing", { kind: "remind" })).rejects.toThrow(/missing/);
  });
});
