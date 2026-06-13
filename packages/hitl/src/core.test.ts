import { describe, expect, it } from "vitest";
import type { HitlResolver } from "./binding";
import {
  createApprovalRequest,
  notifyVia,
  remindApproval,
  resolveApproval,
  timeoutApproval,
  type HitlRuntime,
} from "./core";
import { field } from "./fields";
import { InMemoryStore } from "./store";
import type { ApprovalRequest, HitlPlugin, Notification } from "./types";

// Test list:
// - createApprovalRequest records the request, sends via the plugin, stores the externalId
// - selects plugin by channel id; defaults to the first; throws on unknown id / no plugins
// - createApprovalRequest is idempotent on the resume token (at-least-once fetch)
// - a retry after a crash between create and send finishes the delivery
// - resolveApproval(approve, no feedbacks) -> APPROVED, resolver called with stored token, plugin.update called
// - resolveApproval(approve, edited feedbacks) -> REVIEWED with validated, typed feedbacks
// - resolveApproval(approve, feedbacks equal to defaults) -> APPROVED (no edits)
// - resolveApproval(deny with reason) -> DENIED
// - invalid feedbacks reject and leave the request pending
// - timeoutApproval: pending -> TIMED_OUT recorded + channel updated
// - timeoutApproval: already resolved -> returns the stored result, no update
// - timeoutApproval: loses the CAS race -> returns the winning result
// - remindApproval: threaded notify while pending; no-op once resolved
// - remindApproval: escalate notify / escalate redeliver on the fallback channel
// - notifyVia routes by channel and resolves parent (approval or batch) to its externalId

class FakeResolver implements HitlResolver {
  readonly resolved: Array<{ token: string; payload: unknown }> = [];

  async resolve(token: string, payload: unknown): Promise<void> {
    this.resolved.push({ token, payload });
  }
}

function fakePlugin(id: string): HitlPlugin & {
  sent: ApprovalRequest[];
  updates: unknown[][];
  notifications: Notification[];
} {
  const sent: ApprovalRequest[] = [];
  const updates: unknown[][] = [];
  const notifications: Notification[] = [];
  return {
    id,
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
    },
  };
}

function makeRuntime(pluginIds: string[] = ["lead-approvals"]) {
  const resolver = new FakeResolver();
  const store = new InMemoryStore();
  const plugins = pluginIds.map(fakePlugin);
  const runtime: HitlRuntime = { resolver, store, plugins };
  return { resolver, store, plugins, runtime };
}

const fields = {
  subject: field.textField({ label: "Subject", default: "Hi" }),
  body: field.textArea({ label: "Body", default: "Hello there" }),
};

describe("createApprovalRequest", () => {
  it("records the request, sends via the default plugin, and stores the externalId", async () => {
    const { runtime, store, plugins } = makeRuntime(["a", "b"]);

    const { id } = await createApprovalRequest(runtime, {
      token: "tok_1",
      message: "Approve?",
      fields,
    });

    expect(plugins[0]!.sent).toHaveLength(1);
    expect(plugins[0]!.sent[0]).toMatchObject({ id, message: "Approve?", channel: "a" });
    expect(plugins[1]!.sent).toHaveLength(0);

    const record = await store.get(id);
    expect(record).toMatchObject({
      status: "pending",
      token: "tok_1",
      channel: "a",
      message: "Approve?",
      externalId: `ext_${id}`,
    });
  });

  it("routes to the plugin matching the channel id", async () => {
    const { runtime, plugins } = makeRuntime(["a", "b"]);

    await createApprovalRequest(runtime, {
      token: "tok_1",
      message: "m",
      fields: {},
      channel: "b",
    });

    expect(plugins[0]!.sent).toHaveLength(0);
    expect(plugins[1]!.sent).toHaveLength(1);
  });

  it("throws on an unknown channel id", async () => {
    const { runtime } = makeRuntime(["a"]);
    await expect(
      createApprovalRequest(runtime, { token: "t", message: "m", fields: {}, channel: "nope" }),
    ).rejects.toThrow(/nope/);
  });

  it("throws when no plugins are configured", async () => {
    const { runtime } = makeRuntime([]);
    await expect(
      createApprovalRequest(runtime, { token: "t", message: "m", fields: {} }),
    ).rejects.toThrow(/no .*plugin/i);
  });

  it("returns the existing id without re-sending when the token is already known", async () => {
    const { runtime, plugins } = makeRuntime();

    const first = await createApprovalRequest(runtime, { token: "tok_1", message: "m", fields });
    const second = await createApprovalRequest(runtime, { token: "tok_1", message: "m", fields });

    expect(second.id).toBe(first.id);
    expect(plugins[0]!.sent).toHaveLength(1);
  });

  it("finishes the delivery when a retry finds a record without an externalId", async () => {
    const { runtime, store, plugins } = makeRuntime();
    // Simulate a crash between create and send: the record exists, no externalId.
    await store.create({ id: "a1", token: "tok_1", channel: "lead-approvals", message: "m", fields });

    const { id } = await createApprovalRequest(runtime, { token: "tok_1", message: "m", fields });

    expect(id).toBe("a1");
    expect(plugins[0]!.sent).toHaveLength(1);
    expect((await store.get("a1"))?.externalId).toBe("ext_a1");
  });
});

describe("resolveApproval", () => {
  async function startApproval(runtime: HitlRuntime, token = "tok_1") {
    const { id } = await createApprovalRequest(runtime, { token, message: "m", fields });
    return id;
  }

  it("approve without feedbacks resolves APPROVED, resumes the engine, and updates the channel", async () => {
    const { runtime, resolver, plugins } = makeRuntime();
    const requestId = await startApproval(runtime);

    const result = await resolveApproval(runtime, {
      requestId,
      decision: "approve",
      by: { name: "ryosuke" },
    });

    expect(result).toEqual({ type: "APPROVED", id: requestId, by: { name: "ryosuke" } });
    expect(resolver.resolved).toEqual([{ token: "tok_1", payload: result }]);
    expect(plugins[0]!.updates).toEqual([[`ext_${requestId}`, result]]);
  });

  it("approve with edited feedbacks resolves REVIEWED with validated values", async () => {
    const { runtime } = makeRuntime();
    const requestId = await startApproval(runtime);

    const result = await resolveApproval(runtime, {
      requestId,
      decision: "approve",
      feedbacks: { subject: "Edited", body: "Hello there" },
    });

    expect(result).toMatchObject({
      type: "REVIEWED",
      feedbacks: { subject: "Edited", body: "Hello there" },
    });
  });

  it("approve with feedbacks identical to defaults resolves plain APPROVED", async () => {
    const { runtime } = makeRuntime();
    const requestId = await startApproval(runtime);

    const result = await resolveApproval(runtime, {
      requestId,
      decision: "approve",
      feedbacks: { subject: "Hi", body: "Hello there" },
    });

    expect(result.type).toBe("APPROVED");
  });

  it("deny resolves DENIED with the reason", async () => {
    const { runtime } = makeRuntime();
    const requestId = await startApproval(runtime);

    const result = await resolveApproval(runtime, { requestId, decision: "deny", reason: "spam" });

    expect(result).toEqual({ type: "DENIED", id: requestId, reason: "spam" });
  });

  it("rejects invalid feedbacks and leaves the request pending", async () => {
    const { runtime, store, resolver } = makeRuntime();
    const requestId = await startApproval(runtime);

    await expect(
      resolveApproval(runtime, {
        requestId,
        decision: "approve",
        feedbacks: { subject: "ok", body: "ok", extra: "nope" },
      }),
    ).rejects.toThrow(/extra/);

    expect((await store.get(requestId))?.status).toBe("pending");
    expect(resolver.resolved).toHaveLength(0);
  });

  it("rejects an unknown request id", async () => {
    const { runtime } = makeRuntime();
    await expect(
      resolveApproval(runtime, { requestId: "missing", decision: "approve" }),
    ).rejects.toThrow(/missing/);
  });
});

describe("timeoutApproval", () => {
  it("resolves a pending approval as TIMED_OUT and updates the channel", async () => {
    const { runtime, store, plugins } = makeRuntime();
    const { id } = await createApprovalRequest(runtime, { token: "tok_1", message: "m", fields });

    const result = await timeoutApproval(runtime, id);

    expect(result).toEqual({ type: "TIMED_OUT", id });
    expect((await store.get(id))?.status).toBe("resolved");
    expect(plugins[0]!.updates).toEqual([[`ext_${id}`, result]]);
  });

  it("returns the stored result when the approval is already resolved", async () => {
    const { runtime, plugins } = makeRuntime();
    const { id } = await createApprovalRequest(runtime, { token: "tok_1", message: "m", fields });
    const resolved = await resolveApproval(runtime, { requestId: id, decision: "approve" });
    plugins[0]!.updates.length = 0;

    const result = await timeoutApproval(runtime, id);

    expect(result).toEqual(resolved);
    expect(plugins[0]!.updates).toHaveLength(0);
  });

  it("returns the winning result when it loses the resolve race", async () => {
    const { runtime, store } = makeRuntime();
    const { id } = await createApprovalRequest(runtime, { token: "tok_1", message: "m", fields });

    // Simulate a callback landing between the pending check and the CAS write.
    const originalResolve = store.resolve.bind(store);
    store.resolve = async () => {
      await originalResolve(id, { type: "APPROVED", id });
      throw new Error(`Approval "${id}" is already resolved`);
    };

    const result = await timeoutApproval(runtime, id);

    expect(result).toEqual({ type: "APPROVED", id });
  });

  it("throws on an unknown approval id", async () => {
    const { runtime } = makeRuntime();
    await expect(timeoutApproval(runtime, "missing")).rejects.toThrow(/missing/);
  });
});

describe("remindApproval", () => {
  it("sends a threaded notify while pending", async () => {
    const { runtime, plugins } = makeRuntime(["a"]);
    const { id } = await createApprovalRequest(runtime, { token: "tok_1", message: "m", fields });

    const { pending } = await remindApproval(runtime, id, {
      kind: "remind",
      message: "Still waiting",
    });

    expect(pending).toBe(true);
    expect(plugins[0]!.notifications).toEqual([
      {
        parent: id,
        message: "Still waiting",
        channel: "a",
        parentExternalId: `ext_${id}`,
      },
    ]);
  });

  it("uses the default reminder message when message is omitted", async () => {
    const { runtime, plugins } = makeRuntime();
    const { id } = await createApprovalRequest(runtime, { token: "tok_1", message: "m", fields });

    await remindApproval(runtime, id, { kind: "remind" });

    expect(plugins[0]!.notifications[0]?.message).toBe("Reminder: approval still pending");
  });

  it("is a no-op once the approval is resolved", async () => {
    const { runtime, plugins } = makeRuntime();
    const { id } = await createApprovalRequest(runtime, { token: "tok_1", message: "m", fields });
    await resolveApproval(runtime, { requestId: id, decision: "approve" });

    const { pending } = await remindApproval(runtime, id, { kind: "remind" });

    expect(pending).toBe(false);
    expect(plugins[0]!.notifications).toHaveLength(0);
  });

  it("escalates with a notify on the fallback channel", async () => {
    const { runtime, plugins } = makeRuntime(["primary", "oncall"]);
    const { id } = await createApprovalRequest(runtime, {
      token: "tok_1",
      message: "m",
      fields,
      channel: "primary",
    });

    await remindApproval(runtime, id, {
      kind: "escalate",
      channel: "oncall",
      message: "Needs eyes",
    });

    expect(plugins[0]!.notifications).toHaveLength(0);
    expect(plugins[1]!.notifications).toEqual([
      {
        message: "Needs eyes",
        channel: "oncall",
        parent: id,
        parentExternalId: `ext_${id}`,
      },
    ]);
  });

  it("escalates with redeliver on the fallback channel", async () => {
    const { runtime, store, plugins } = makeRuntime(["primary", "oncall"]);
    const { id } = await createApprovalRequest(runtime, {
      token: "tok_1",
      message: "Escalate me",
      fields,
      channel: "primary",
    });

    await remindApproval(runtime, id, {
      kind: "escalate",
      channel: "oncall",
      mode: "redeliver",
    });

    expect(plugins[1]!.sent[0]).toMatchObject({
      id,
      channel: "oncall",
      message: "Escalate me",
    });
    expect((await store.get(id))?.externalIds?.oncall).toBe(`ext_${id}`);

    // Resolution updates both deliveries.
    await resolveApproval(runtime, { requestId: id, decision: "approve" });
    expect(plugins[0]!.updates).toHaveLength(1);
    expect(plugins[1]!.updates).toHaveLength(1);
  });

  it("throws on an unknown approval id", async () => {
    const { runtime } = makeRuntime();
    await expect(remindApproval(runtime, "missing", { kind: "remind" })).rejects.toThrow(
      /missing/,
    );
  });
});

describe("notifyVia", () => {
  it("routes to the default plugin", async () => {
    const { runtime, plugins } = makeRuntime(["a", "b"]);
    await notifyVia(runtime, { message: "progress" });
    expect(plugins[0]!.notifications).toEqual([{ message: "progress" }]);
  });

  it("resolves the parent approval id to the channel externalId", async () => {
    const { runtime, plugins } = makeRuntime();
    const { id } = await createApprovalRequest(runtime, { token: "tok_1", message: "m", fields });

    await notifyVia(runtime, { message: "context", parent: id });

    expect(plugins[0]!.notifications[0]).toMatchObject({
      message: "context",
      parent: id,
      parentExternalId: `ext_${id}`,
    });
  });
});
