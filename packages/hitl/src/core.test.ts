import { describe, expect, it } from "vitest";
import type { HitlResolver } from "./binding";
import {
  createHumanRequest,
  notifyVia,
  remindHumanRequest,
  resolveChannel,
  resolveHumanRequest,
  resolveThreadAnchor,
  timeoutHumanRequest,
  type HitlRuntime,
} from "./core";
import { field } from "./fields";
import { actions } from "./human-actions-builder";
import { InMemoryState } from "./state";
import type { HumanRequest, HitlAdapter, Notification } from "./types";

// Test list:
// - createHumanRequest records the request, sends via the adapter, stores the externalId
// - selects adapter by channel id; defaults to the first; throws on unknown id / no adapters
// - createHumanRequest is idempotent on the resume token (at-least-once fetch)
// - a retry after a crash between create and send finishes the delivery
// - resolveHumanRequest(submit, no feedbacks) -> RESOLVED, resolver called with stored token, adapter.update called
// - resolveHumanRequest(submit, edited feedbacks) -> RESOLVED with edited: true and validated feedbacks
// - resolveHumanRequest(submit, feedbacks equal to defaults) -> RESOLVED without edited
// - resolveHumanRequest(deny with reason) -> RESOLVED actionId deny
// - invalid feedbacks reject and leave the request pending
// - timeoutHumanRequest: pending -> TIMED_OUT recorded + channel updated
// - timeoutHumanRequest: already resolved -> returns the stored result, no update
// - timeoutHumanRequest: loses the CAS race -> returns the winning result
// - remindHumanRequest: threaded notify while pending; no-op once resolved
// - remindHumanRequest: escalate notify / escalate redeliver on the fallback channel
// - notifyVia routes by channel and resolves parent (approval or batch) to its externalId

class FakeResolver implements HitlResolver {
  readonly resolved: Array<{ token: string; payload: unknown }> = [];

  async resolve(token: string, payload: unknown): Promise<void> {
    this.resolved.push({ token, payload });
  }
}

function fakeAdapter(
  id: string,
  options?: { defaultChannel?: string },
): HitlAdapter & {
  sent: HumanRequest[];
  updates: unknown[][];
  notifications: Notification[];
} {
  const sent: HumanRequest[] = [];
  const updates: unknown[][] = [];
  const notifications: Notification[] = [];
  return {
    id,
    defaultChannel: options?.defaultChannel,
    sent,
    updates,
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
      return { externalId: notification.threadRef ? `notify_${notification.threadRef}` : undefined };
    },
  };
}

function makeRuntime(adapterIds: string[] = ["lead-approvals"]) {
  const resolver = new FakeResolver();
  const state = new InMemoryState();
  const adapters = adapterIds.map((id) => fakeAdapter(id));
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

describe("createHumanRequest", () => {
  it("records the request, sends via the default adapter, and stores the externalId", async () => {
    const { runtime, state, adapters } = makeRuntime(["a", "b"]);

    const { id } = await createHumanRequest(runtime, {
      token: "tok_1",
      message: "Approve?",
      actions: approvalActions,
    });

    expect(adapters[0]!.sent).toHaveLength(1);
    expect(adapters[0]!.sent[0]).toMatchObject({ id, message: "Approve?", channel: "a" });
    expect(adapters[1]!.sent).toHaveLength(0);

    const record = await state.get(id);
    expect(record).toMatchObject({
      status: "pending",
      token: "tok_1",
      channel: "a",
      message: "Approve?",
      externalId: `ext_${id}`,
    });
  });

  it("routes to the adapter matching the channel id", async () => {
    const { runtime, adapters } = makeRuntime(["a", "b"]);

    await createHumanRequest(runtime, {
      token: "tok_1",
      message: "m",
      actions: approveOnly,
      channel: "b",
    });

    expect(adapters[0]!.sent).toHaveLength(0);
    expect(adapters[1]!.sent).toHaveLength(1);
  });

  it("throws on an unknown channel id", async () => {
    const { runtime } = makeRuntime(["a"]);
    await expect(
      createHumanRequest(runtime, { token: "t", message: "m", actions: approveOnly, channel: "nope" }),
    ).rejects.toThrow(/nope/);
  });

  it("throws when no adapters are configured", async () => {
    const { runtime } = makeRuntime([]);
    await expect(
      createHumanRequest(runtime, { token: "t", message: "m", actions: approveOnly }),
    ).rejects.toThrow(/no .*adapter/i);
  });

  it("returns the existing id without re-sending when the token is already known", async () => {
    const { runtime, adapters } = makeRuntime();

    const first = await createHumanRequest(runtime, { token: "tok_1", message: "m", actions: approvalActions });
    const second = await createHumanRequest(runtime, { token: "tok_1", message: "m", actions: approvalActions });

    expect(second.id).toBe(first.id);
    expect(adapters[0]!.sent).toHaveLength(1);
  });

  it("finishes the delivery when a retry finds a record without an externalId", async () => {
    const { runtime, state, adapters } = makeRuntime();
    // Simulate a crash between create and send: the record exists, no externalId.
    await state.create({ id: "a1", token: "tok_1", channel: "lead-approvals", message: "m", actions: approvalActions });

    const { id } = await createHumanRequest(runtime, { token: "tok_1", message: "m", actions: approvalActions });

    expect(id).toBe("a1");
    expect(adapters[0]!.sent).toHaveLength(1);
    expect((await state.get("a1"))?.externalId).toBe("ext_a1");
  });
});

describe("resolveHumanRequest", () => {
  async function startApproval(runtime: HitlRuntime, token = "tok_1") {
    const { id } = await createHumanRequest(runtime, { token, message: "m", actions: approvalActions });
    return id;
  }

  it("submit without feedbacks resolves RESOLVED, resumes the engine, and updates the channel", async () => {
    const { runtime, resolver, adapters } = makeRuntime();
    const requestId = await startApproval(runtime);

    const result = await resolveHumanRequest(runtime, {
      requestId,
      actionId: "approve",
      by: { name: "ryosuke" },
    });

    expect(result).toEqual({
      type: "RESOLVED",
      actionId: "approve",
      id: requestId,
      by: { name: "ryosuke" },
      feedbacks: { subject: "Hi", body: "Hello there" },
    });
    expect(resolver.resolved).toEqual([{ token: "tok_1", payload: result }]);
    expect(adapters[0]!.updates).toEqual([[`ext_${requestId}`, result]]);
  });

  it("submit with edited feedbacks resolves RESOLVED with edited: true", async () => {
    const { runtime } = makeRuntime();
    const requestId = await startApproval(runtime);

    const result = await resolveHumanRequest(runtime, {
      requestId,
      actionId: "approve",
      feedbacks: { subject: "Edited", body: "Hello there" },
    });

    expect(result).toMatchObject({
      type: "RESOLVED",
      actionId: "approve",
      feedbacks: { subject: "Edited", body: "Hello there" },
      edited: true,
    });
  });

  it("submit with feedbacks identical to defaults resolves RESOLVED without edited", async () => {
    const { runtime } = makeRuntime();
    const requestId = await startApproval(runtime);

    const result = await resolveHumanRequest(runtime, {
      requestId,
      actionId: "approve",
      feedbacks: { subject: "Hi", body: "Hello there" },
    });

    expect(result).toMatchObject({
      type: "RESOLVED",
      actionId: "approve",
      feedbacks: { subject: "Hi", body: "Hello there" },
    });
    expect(result).not.toHaveProperty("edited");
  });

  it("deny resolves RESOLVED with actionId deny and the reason", async () => {
    const { runtime } = makeRuntime();
    const requestId = await startApproval(runtime);

    const result = await resolveHumanRequest(runtime, {
      requestId,
      actionId: "deny",
      feedbacks: { reason: "spam" },
    });

    expect(result).toMatchObject({
      type: "RESOLVED",
      actionId: "deny",
      id: requestId,
      feedbacks: { reason: "spam" },
    });
  });

  it("rejects invalid feedbacks and leaves the request pending", async () => {
    const { runtime, state, resolver } = makeRuntime();
    const requestId = await startApproval(runtime);

    await expect(
      resolveHumanRequest(runtime, {
        requestId,
        actionId: "approve",
        feedbacks: { subject: "ok", body: "ok", extra: "nope" },
      }),
    ).rejects.toThrow(/extra/);

    expect((await state.get(requestId))?.status).toBe("pending");
    expect(resolver.resolved).toHaveLength(0);
  });

  it("rejects an unknown request id", async () => {
    const { runtime } = makeRuntime();
    await expect(
      resolveHumanRequest(runtime, { requestId: "missing", actionId: "approve" }),
    ).rejects.toThrow(/missing/);
  });
});

describe("timeoutHumanRequest", () => {
  it("resolves a pending approval as TIMED_OUT and updates the channel", async () => {
    const { runtime, state, adapters } = makeRuntime();
    const { id } = await createHumanRequest(runtime, { token: "tok_1", message: "m", actions: approvalActions });

    const result = await timeoutHumanRequest(runtime, id);

    expect(result).toEqual({ type: "TIMED_OUT", id });
    expect((await state.get(id))?.status).toBe("resolved");
    expect(adapters[0]!.updates).toEqual([[`ext_${id}`, result]]);
  });

  it("returns the stored result when the approval is already resolved", async () => {
    const { runtime, adapters } = makeRuntime();
    const { id } = await createHumanRequest(runtime, { token: "tok_1", message: "m", actions: approvalActions });
    const resolved = await resolveHumanRequest(runtime, { requestId: id, actionId: "approve" });
    adapters[0]!.updates.length = 0;

    const result = await timeoutHumanRequest(runtime, id);

    expect(result).toEqual(resolved);
    expect(adapters[0]!.updates).toHaveLength(0);
  });

  it("returns the winning result when it loses the resolve race", async () => {
    const { runtime, state } = makeRuntime();
    const { id } = await createHumanRequest(runtime, { token: "tok_1", message: "m", actions: approvalActions });

    // Simulate a callback landing between the pending check and the CAS write.
    const originalResolve = state.resolve.bind(state);
    state.resolve = async () => {
      await originalResolve(id, { type: "RESOLVED", actionId: "approve", id, feedbacks: {} });
      throw new Error(`Approval "${id}" is already resolved`);
    };

    const result = await timeoutHumanRequest(runtime, id);

    expect(result).toEqual({ type: "RESOLVED", actionId: "approve", id, feedbacks: {} });
  });

  it("throws on an unknown approval id", async () => {
    const { runtime } = makeRuntime();
    await expect(timeoutHumanRequest(runtime, "missing")).rejects.toThrow(/missing/);
  });
});

describe("remindHumanRequest", () => {
  it("sends a threaded notify while pending", async () => {
    const { runtime, adapters } = makeRuntime(["a"]);
    const { id } = await createHumanRequest(runtime, { token: "tok_1", message: "m", actions: approvalActions });

    const { pending } = await remindHumanRequest(runtime, id, {
      kind: "remind",
      message: "Still waiting",
    });

    expect(pending).toBe(true);
    expect(adapters[0]!.notifications).toEqual([
      {
        threadId: id,
        message: "Still waiting",
        channel: "a",
        threadRef: `ext_${id}`,
      },
    ]);
  });

  it("uses the default reminder message when message is omitted", async () => {
    const { runtime, adapters } = makeRuntime();
    const { id } = await createHumanRequest(runtime, { token: "tok_1", message: "m", actions: approvalActions });

    await remindHumanRequest(runtime, id, { kind: "remind" });

    expect(adapters[0]!.notifications[0]?.message).toBe("Reminder: approval still pending");
  });

  it("is a no-op once the approval is resolved", async () => {
    const { runtime, adapters } = makeRuntime();
    const { id } = await createHumanRequest(runtime, { token: "tok_1", message: "m", actions: approvalActions });
    await resolveHumanRequest(runtime, { requestId: id, actionId: "approve" });

    const { pending } = await remindHumanRequest(runtime, id, { kind: "remind" });

    expect(pending).toBe(false);
    expect(adapters[0]!.notifications).toHaveLength(0);
  });

  it("escalates with a notify on the fallback channel", async () => {
    const { runtime, adapters } = makeRuntime(["primary", "oncall"]);
    const { id } = await createHumanRequest(runtime, {
      token: "tok_1",
      message: "m",
      actions: approvalActions,
      channel: "primary",
    });

    await remindHumanRequest(runtime, id, {
      kind: "escalate",
      channel: "oncall",
      message: "Needs eyes",
    });

    expect(adapters[0]!.notifications).toHaveLength(0);
    expect(adapters[1]!.notifications).toEqual([
      {
        message: "Needs eyes",
        channel: "oncall",
        threadId: id,
        threadRef: `ext_${id}`,
      },
    ]);
  });

  it("escalates with redeliver on the fallback channel", async () => {
    const { runtime, state, adapters } = makeRuntime(["primary", "oncall"]);
    const { id } = await createHumanRequest(runtime, {
      token: "tok_1",
      message: "Escalate me",
      actions: approvalActions,
      channel: "primary",
    });

    await remindHumanRequest(runtime, id, {
      kind: "escalate",
      channel: "oncall",
      mode: "redeliver",
    });

    expect(adapters[1]!.sent[0]).toMatchObject({
      id,
      channel: "oncall",
      message: "Escalate me",
    });
    expect((await state.get(id))?.externalIds?.oncall).toBe(`ext_${id}`);

    // Resolution updates both deliveries.
    await resolveHumanRequest(runtime, { requestId: id, actionId: "approve" });
    expect(adapters[0]!.updates).toHaveLength(1);
    expect(adapters[1]!.updates).toHaveLength(1);
  });

  it("throws on an unknown approval id", async () => {
    const { runtime } = makeRuntime();
    await expect(remindHumanRequest(runtime, "missing", { kind: "remind" })).rejects.toThrow(
      /missing/,
    );
  });
});

describe("notifyVia", () => {
  it("routes to the default adapter and returns a ThreadAnchor", async () => {
    const { runtime, adapters, state } = makeRuntime(["a", "b"]);
    const anchor = await notifyVia(runtime, { message: "progress" });
    expect(anchor.id).toBeTruthy();
    expect(adapters[0]!.notifications[0]).toMatchObject({ message: "progress", channel: "a" });
    const delivery = await state.getNotifyDelivery(anchor.id);
    expect(delivery).toMatchObject({ message: "progress", channel: "a", groupId: anchor.id });
  });

  it("resolves the parent approval id to the channel externalId", async () => {
    const { runtime, adapters } = makeRuntime();
    const { id } = await createHumanRequest(runtime, { token: "tok_1", message: "m", actions: approvalActions });

    await notifyVia(runtime, { message: "context", threadId: id });

    expect(adapters[0]!.notifications[0]).toMatchObject({
      message: "context",
      threadId: id,
      threadRef: `ext_${id}`,
    });
  });

  it("resolves after id to the channel externalId", async () => {
    const { runtime, adapters } = makeRuntime();
    const { id } = await createHumanRequest(runtime, { token: "tok_1", message: "m", actions: approvalActions });

    await notifyVia(runtime, { message: "context", after: { id } });

    expect(adapters[0]!.notifications[0]).toMatchObject({
      message: "context",
      threadId: id,
      threadRef: `ext_${id}`,
    });
  });

  it("resolves on id to the channel externalId", async () => {
    const { runtime, adapters } = makeRuntime();
    const { id } = await createHumanRequest(runtime, { token: "tok_1", message: "m", actions: approvalActions });

    await notifyVia(runtime, { message: "context", on: id });

    expect(adapters[0]!.notifications[0]).toMatchObject({
      message: "context",
      threadId: id,
      threadRef: `ext_${id}`,
    });
  });

  it("stores notify externalId on the delivery record", async () => {
    const { runtime, state } = makeRuntime();
    const { id } = await createHumanRequest(runtime, { token: "tok_1", message: "m", actions: approvalActions });

    const anchor = await notifyVia(runtime, { message: "context", after: { id } });
    const delivery = await state.getNotifyDelivery(anchor.id);
    expect(delivery?.externalId).toBe(`notify_ext_${id}`);
  });

  it("resolveThreadAnchor resolves notify delivery id to externalId", async () => {
    const { runtime, state } = makeRuntime();
    const { id } = await createHumanRequest(runtime, { token: "tok_1", message: "m", actions: approvalActions });
    const anchor = await notifyVia(runtime, { message: "ping", after: { id } });

    const ctx = await resolveThreadAnchor(state, anchor.id);
    expect(ctx.deliveryRef).toBe(`notify_ext_${id}`);
    expect(ctx.groupId).toBe(id);
  });

  it("createHumanRequest passes threadRef when after is a notify anchor", async () => {
    const { runtime, adapters, state } = makeRuntime();
    const { id } = await createHumanRequest(runtime, { token: "tok_1", message: "m", actions: approvalActions });
    const anchor = await notifyVia(runtime, { message: "ping", after: { id } });

    await createHumanRequest(runtime, {
      token: "tok_2",
      message: "Proceed?",
      actions: approveOnly,
      after: { id: anchor.id },
    });

    expect(adapters[0]!.sent.at(-1)).toMatchObject({
      message: "Proceed?",
      threadRef: `notify_ext_${id}`,
    });
    void state;
  });

  it("createHumanRequest prefers inThread over after", async () => {
    const { runtime, adapters } = makeRuntime();
    const { id } = await createHumanRequest(runtime, { token: "tok_1", message: "m", actions: approvalActions });

    await createHumanRequest(runtime, {
      token: "tok_2",
      message: "Proceed?",
      actions: approveOnly,
      after: { id },
      inThread: "slack:C123:ts-99",
    });

    expect(adapters[0]!.sent.at(-1)).toMatchObject({
      threadRef: "slack:C123:ts-99",
    });
  });
});

describe("resolveChannel", () => {
  it("defaults to the first adapter when channel is omitted", () => {
    const adapters = [fakeAdapter("a"), fakeAdapter("b")];
    const resolved = resolveChannel(adapters, undefined);
    expect(resolved.adapter.id).toBe("a");
    expect(resolved.channelRef).toBe("a");
    expect(resolved.destination).toBeUndefined();
  });

  it("matches adapter id exactly and uses defaultChannel in channelRef", () => {
    const adapters = [fakeAdapter("slack", { defaultChannel: "slack:C123" })];
    const resolved = resolveChannel(adapters, "slack");
    expect(resolved.destination).toBeUndefined();
    expect(resolved.channelRef).toBe("slack:slack:C123");
  });

  it("parses adapter_id:destination with longest prefix match", () => {
    const adapters = [
      fakeAdapter("internal", { defaultChannel: "slack:C000" }),
      fakeAdapter("internal_slack", { defaultChannel: "slack:C123" }),
    ];
    const resolved = resolveChannel(adapters, "internal_slack:slack:C999");
    expect(resolved.adapter.id).toBe("internal_slack");
    expect(resolved.destination).toBe("slack:C999");
    expect(resolved.channelRef).toBe("internal_slack:slack:C999");
  });
});

describe("createHumanRequest with destination", () => {
  it("passes destination to the adapter and stores normalized channelRef", async () => {
    const { runtime, state, adapters } = makeRuntime(["slack"]);
    adapters[0]!.defaultChannel = "slack:C123";

    const { id } = await createHumanRequest(runtime, {
      token: "tok_1",
      message: "Approve?",
      actions: approveOnly,
      channel: "slack:slack:C999",
    });

    expect(adapters[0]!.sent[0]).toMatchObject({
      id,
      channel: "slack",
      destination: "slack:C999",
    });
    expect((await state.get(id))?.channel).toBe("slack:slack:C999");
  });

  it("escalates redeliver to the same adapter on a different destination", async () => {
    const adapter = fakeAdapter("slack", { defaultChannel: "slack:C123" });
    const runtime: HitlRuntime = {
      resolver: new FakeResolver(),
      state: new InMemoryState(),
      adapters: [adapter],
    };
    const { id } = await createHumanRequest(runtime, {
      token: "tok_1",
      message: "Escalate me",
      actions: approvalActions,
      channel: "slack:slack:C123",
    });

    await remindHumanRequest(runtime, id, {
      kind: "escalate",
      channel: "slack:slack:C999",
      mode: "redeliver",
    });

    expect(adapter.sent).toHaveLength(2);
    expect(adapter.sent[1]).toMatchObject({
      id,
      channel: "slack",
      destination: "slack:C999",
    });
    expect((await runtime.state.get(id))?.externalIds?.["slack:slack:C999"]).toBe(`ext_${id}`);

    await resolveHumanRequest(runtime, { requestId: id, actionId: "approve" });
    expect(adapter.updates).toHaveLength(2);
  });
});
