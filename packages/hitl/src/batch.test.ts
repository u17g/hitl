import { describe, expect, it } from "vitest";
import type { CreateBatchBody } from "./api-types";
import type { HitlResolver } from "./binding";
import {
  createBatchRequest,
  remindBatch,
  resolveHumanRequest,
  resolveBatchHumanRequest,
  timeoutBatch,
  type HitlRuntime,
} from "./core";
import { field } from "./fields";
import { actions } from "./human-actions-builder";
import { approveAction } from "./human-actions";
import { InMemoryState } from "./state";
import type {
  HumanRequest,
  HumanResult,
  BatchHumanRequest,
  HitlAdapter,
  Notification,
} from "./types";

// Test list:
// - createBatchRequest delivers one message via sendBatch; records batch + item records
// - falls back to per-item send when the adapter has no sendBatch / canSendBatch is false
// - throws on empty items
// - is idempotent on the first item's resume token (at-least-once fetch)
// - one batch callback resolves every item via the resolver; results in input order
// - per-item decisions map independently: deny+reason -> RESOLVED deny, edits -> RESOLVED edited, defaults -> RESOLVED submit
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

interface FakeAdapter extends HitlAdapter {
  sent: HumanRequest[];
  sentBatches: BatchHumanRequest[];
  updates: unknown[][];
  batchUpdates: Array<[string, HumanResult[]]>;
  notifications: Notification[];
}

function fakeAdapter(id: string, opts?: { batch?: boolean }): FakeAdapter {
  const sent: HumanRequest[] = [];
  const sentBatches: BatchHumanRequest[] = [];
  const updates: unknown[][] = [];
  const batchUpdates: Array<[string, HumanResult[]]> = [];
  const notifications: Notification[] = [];
  const adapter: FakeAdapter = {
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
    adapter.sendBatch = async (request) => {
      sentBatches.push(request);
      return { externalId: `bext_${request.batchId}` };
    };
    adapter.updateBatch = async (externalId, results) => {
      batchUpdates.push([externalId, results]);
    };
  }
  return adapter;
}

function makeRuntime(adapters: FakeAdapter[]) {
  const resolver = new FakeResolver();
  const state = new InMemoryState();
  const runtime: HitlRuntime = { resolver, state, adapters };
  return { resolver, state, adapters, runtime };
}

const fields = {
  subject: field.textField({ label: "Subject", default: "Hi" }),
  body: field.textArea({ label: "Body", default: "Hello there" }),
};
const approvalActions = actions()
  .approve({ fields })
  .deny({ fields: { reason: field.textField({ label: "Reason" }) } })
  .build();
const approveOnly = actions().approve({}).build();

/** Two items; the first overrides the shared `subject` default. */
function emailBatch(): CreateBatchBody {
  return {
    message: "Outbound emails",
    actions: approvalActions,
    items: [
      {
        token: "tok_0",
        message: "Email to ACME",
        defaults: { subject: "Hello ACME" },
      },
      { token: "tok_1", message: "Email to Globex" },
    ],
  };
}

describe("createBatchRequest", () => {
  it("delivers the batch as one message and records batch + items", async () => {
    const { runtime, state, adapters } = makeRuntime([fakeAdapter("a")]);

    const { batchId, ids } = await createBatchRequest(runtime, emailBatch());

    expect(ids).toEqual([`${batchId}:0`, `${batchId}:1`]);
    expect(adapters[0]!.sentBatches).toHaveLength(1);
    expect(adapters[0]!.sent).toHaveLength(0);
    expect(adapters[0]!.sentBatches[0]).toMatchObject({
      batchId,
      channel: "a",
      message: "Outbound emails",
      actions: approvalActions,
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
    expect(approveAction(items[0]!.actions)!.fields!.subject).toMatchObject({
      kind: "text",
      default: "Hello ACME",
    });
    expect(items.every((r) => r.status === "pending")).toBe(true);
  });

  it("falls back to per-item send when the adapter has no sendBatch", async () => {
    const { runtime, state, adapters } = makeRuntime([fakeAdapter("a", { batch: false })]);

    const { batchId, ids } = await createBatchRequest(runtime, emailBatch());

    expect(adapters[0]!.sent.map((r) => r.id)).toEqual(ids);
    expect((await state.get(`${batchId}:0`))?.externalId).toBe(`ext_${batchId}:0`);
    expect((await state.getBatch(batchId))?.externalId).toBeUndefined();
  });

  it("falls back to per-item send when canSendBatch returns false", async () => {
    const adapter = fakeAdapter("a");
    adapter.canSendBatch = () => false;
    const { runtime, adapters } = makeRuntime([adapter]);

    await createBatchRequest(runtime, emailBatch());

    expect(adapters[0]!.sentBatches).toHaveLength(0);
    expect(adapters[0]!.sent).toHaveLength(2);
  });

  it("throws on empty items", async () => {
    const { runtime } = makeRuntime([fakeAdapter("a")]);
    await expect(
      createBatchRequest(runtime, { actions: approveOnly, items: [] }),
    ).rejects.toThrow(/at least one item/i);
  });

  it("returns the existing batch without re-sending when the first token is known", async () => {
    const { runtime, adapters } = makeRuntime([fakeAdapter("a")]);

    const first = await createBatchRequest(runtime, emailBatch());
    const second = await createBatchRequest(runtime, emailBatch());

    expect(second).toEqual(first);
    expect(adapters[0]!.sentBatches).toHaveLength(1);
  });
});

describe("resolveBatchHumanRequest", () => {
  it("one submit resolves every item via the resolver; results come back in input order", async () => {
    const { runtime, resolver, adapters } = makeRuntime([fakeAdapter("a")]);
    const { batchId } = await createBatchRequest(runtime, emailBatch());

    const results = await resolveBatchHumanRequest(runtime, {
      batchId,
      by: { name: "ryosuke" },
      decisions: [
        { requestId: `${batchId}:1`, actionId: "approve" },
        { requestId: `${batchId}:0`, actionId: "approve" },
      ],
    });

    expect(results).toEqual([
      {
        type: "RESOLVED",
        actionId: "approve",
        id: `${batchId}:0`,
        by: { name: "ryosuke" },
        feedbacks: { subject: "Hello ACME", body: "Hello there" },
      },
      {
        type: "RESOLVED",
        actionId: "approve",
        id: `${batchId}:1`,
        by: { name: "ryosuke" },
        feedbacks: { subject: "Hi", body: "Hello there" },
      },
    ]);
    expect(resolver.resolved).toEqual([
      { token: "tok_0", payload: results[0] },
      { token: "tok_1", payload: results[1] },
    ]);
    expect(adapters[0]!.batchUpdates).toEqual([[`bext_${batchId}`, results]]);
  });

  it("maps per-item decisions independently", async () => {
    const { runtime } = makeRuntime([fakeAdapter("a")]);
    const { batchId } = await createBatchRequest(runtime, {
      actions: approvalActions,
      items: [
        { token: "t0", message: "approve me" },
        { token: "t1", message: "deny me" },
        {
          token: "t2",
          message: "edit me",
          defaults: { subject: "Prefilled" },
        },
      ],
    });

    const results = await resolveBatchHumanRequest(runtime, {
      batchId,
      decisions: [
        // feedbacks equal to merged defaults -> RESOLVED submit
        { requestId: `${batchId}:0`, actionId: "approve", feedbacks: { subject: "Hi" } },
        { requestId: `${batchId}:1`, actionId: "deny", feedbacks: { reason: "spam" } },
        // edited away from the item's merged default -> RESOLVED edited
        { requestId: `${batchId}:2`, actionId: "approve", feedbacks: { subject: "Edited" } },
      ],
    });

    expect(results.map((r) => (r.type === "RESOLVED" ? r.actionId : r.type))).toEqual([
      "approve",
      "deny",
      "approve",
    ]);
    expect(results[0]).toMatchObject({ type: "RESOLVED", actionId: "approve" });
    expect(results[0]).not.toHaveProperty("edited");
    expect(results[1]).toMatchObject({ type: "RESOLVED", actionId: "deny", feedbacks: { reason: "spam" } });
    expect(results[2]).toMatchObject({
      type: "RESOLVED",
      actionId: "approve",
      feedbacks: { subject: "Edited", body: "Hello there" },
      edited: true,
    });
  });

  it("rejects invalid feedbacks and leaves every item pending", async () => {
    const { runtime, state, resolver } = makeRuntime([fakeAdapter("a")]);
    const { batchId } = await createBatchRequest(runtime, emailBatch());

    await expect(
      resolveBatchHumanRequest(runtime, {
        batchId,
        decisions: [
          { requestId: `${batchId}:0`, actionId: "approve" },
          { requestId: `${batchId}:1`, actionId: "approve", feedbacks: { bogus: "x" } },
        ],
      }),
    ).rejects.toThrow(/bogus/);

    const items = await state.listByBatch(batchId);
    expect(items.every((r) => r.status === "pending")).toBe(true);
    expect(resolver.resolved).toHaveLength(0);
  });

  it("skips already-resolved items on batch submit", async () => {
    const { runtime, adapters } = makeRuntime([fakeAdapter("a", { batch: false })]);
    const { batchId } = await createBatchRequest(runtime, emailBatch());

    await resolveHumanRequest(runtime, { requestId: `${batchId}:0`, actionId: "deny", feedbacks: { reason: "no" } });
    adapters[0]!.updates.length = 0;

    const results = await resolveBatchHumanRequest(runtime, {
      batchId,
      decisions: [
        { requestId: `${batchId}:0`, actionId: "approve" },
        { requestId: `${batchId}:1`, actionId: "approve" },
      ],
    });

    expect(results[0]).toMatchObject({
      type: "RESOLVED",
      actionId: "deny",
      id: `${batchId}:0`,
      feedbacks: { reason: "no" },
    });
    expect(results[1]).toMatchObject({ type: "RESOLVED", actionId: "approve" });
  });

  it("throws when a pending item has no decision", async () => {
    const { runtime, state } = makeRuntime([fakeAdapter("a")]);
    const { batchId } = await createBatchRequest(runtime, emailBatch());

    await expect(
      resolveBatchHumanRequest(runtime, {
        batchId,
        decisions: [{ requestId: `${batchId}:0`, actionId: "approve" }],
      }),
    ).rejects.toThrow(/missing decision/i);

    const items = await state.listByBatch(batchId);
    expect(items.every((r) => r.status === "pending")).toBe(true);
  });

  it("throws on an unknown batch id", async () => {
    const { runtime } = makeRuntime([fakeAdapter("a")]);
    await expect(
      resolveBatchHumanRequest(runtime, { batchId: "missing", decisions: [] }),
    ).rejects.toThrow(/missing/);
  });

  it("uses per-item update on the fallback path", async () => {
    const { runtime, adapters } = makeRuntime([fakeAdapter("a", { batch: false })]);
    const { batchId } = await createBatchRequest(runtime, emailBatch());

    const results = await resolveBatchHumanRequest(runtime, {
      batchId,
      decisions: [
        { requestId: `${batchId}:0`, actionId: "approve" },
        { requestId: `${batchId}:1`, actionId: "approve" },
      ],
    });

    expect(adapters[0]!.updates).toEqual([
      [`ext_${batchId}:0`, results[0]],
      [`ext_${batchId}:1`, results[1]],
    ]);
  });
});

describe("timeoutBatch", () => {
  it("times out pending items and keeps resolved ones", async () => {
    const { runtime, state, adapters } = makeRuntime([fakeAdapter("a")]);
    const { batchId } = await createBatchRequest(runtime, emailBatch());

    await resolveHumanRequest(runtime, { requestId: `${batchId}:0`, actionId: "approve" });

    const results = await timeoutBatch(runtime, batchId);

    expect(results[0]).toMatchObject({ type: "RESOLVED", actionId: "approve", id: `${batchId}:0` });
    expect(results[1]).toEqual({ type: "TIMED_OUT", id: `${batchId}:1` });
    expect((await state.get(`${batchId}:1`))?.status).toBe("resolved");
    expect(adapters[0]!.batchUpdates.at(-1)).toEqual([`bext_${batchId}`, results]);
  });

  it("throws on an unknown batch id", async () => {
    const { runtime } = makeRuntime([fakeAdapter("a")]);
    await expect(timeoutBatch(runtime, "missing")).rejects.toThrow(/missing/);
  });
});

describe("remindBatch", () => {
  it("threads a reminder notify under the batch message", async () => {
    const { runtime, adapters } = makeRuntime([fakeAdapter("a")]);
    const { batchId } = await createBatchRequest(runtime, emailBatch());

    const { pending } = await remindBatch(runtime, batchId, {
      kind: "remind",
      message: "Still waiting",
    });

    expect(pending).toBe(true);
    expect(adapters[0]!.notifications).toEqual([
      {
        threadId: batchId,
        message: "Still waiting",
        channel: "a",
        threadRef: `bext_${batchId}`,
      },
    ]);
  });

  it("threads under the first item's message on the fallback path", async () => {
    const { runtime, adapters } = makeRuntime([fakeAdapter("a", { batch: false })]);
    const { batchId } = await createBatchRequest(runtime, emailBatch());

    await remindBatch(runtime, batchId, { kind: "remind" });

    expect(adapters[0]!.notifications[0]?.threadRef).toBe(`ext_${batchId}:0`);
  });

  it("is a no-op once every item is resolved", async () => {
    const { runtime, adapters } = makeRuntime([fakeAdapter("a")]);
    const { batchId } = await createBatchRequest(runtime, emailBatch());
    await resolveBatchHumanRequest(runtime, {
      batchId,
      decisions: [
        { requestId: `${batchId}:0`, actionId: "approve" },
        { requestId: `${batchId}:1`, actionId: "approve" },
      ],
    });

    const { pending } = await remindBatch(runtime, batchId, { kind: "remind" });

    expect(pending).toBe(false);
    expect(adapters[0]!.notifications).toHaveLength(0);
  });

  it("escalates with redeliver of the whole batch on the fallback channel", async () => {
    const primary = fakeAdapter("primary");
    const oncall = fakeAdapter("oncall");
    const { runtime, state } = makeRuntime([primary, oncall]);
    const { batchId } = await createBatchRequest(runtime, { ...emailBatch(), channel: "primary" });

    await remindBatch(runtime, batchId, {
      kind: "escalate",
      channel: "oncall",
      mode: "redeliver",
    });

    expect(oncall.sentBatches[0]).toMatchObject({ batchId, channel: "oncall" });
    expect((await state.getBatch(batchId))?.externalIds?.oncall).toBe(`bext_${batchId}`);

    const results = await resolveBatchHumanRequest(runtime, {
      batchId,
      decisions: [
        { requestId: `${batchId}:0`, actionId: "approve" },
        { requestId: `${batchId}:1`, actionId: "approve" },
      ],
    });

    expect(primary.batchUpdates).toEqual([[`bext_${batchId}`, results]]);
    expect(oncall.batchUpdates).toEqual([[`bext_${batchId}`, results]]);
  });

  it("throws on an unknown batch id", async () => {
    const { runtime } = makeRuntime([fakeAdapter("a")]);
    await expect(remindBatch(runtime, "missing", { kind: "remind" })).rejects.toThrow(/missing/);
  });
});
