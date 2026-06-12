import { describe, expect, it, vi } from "vitest";
import type { EngineBinding, EngineSuspension } from "./binding";
import { notifyVia, requestApproval, resolveApproval, type HitlRuntime } from "./core";
import { field } from "./fields";
import { InMemoryStore } from "./store";
import type { ApprovalRequest, HitlPlugin, Notification } from "./types";

// Test list:
// - selects plugin by channel id; defaults to the first; throws on unknown id
// - records the request in the store and calls plugin.send, storing the externalId
// - resolveApproval(approve, no feedbacks) -> APPROVED, hook resolved, plugin.update called
// - resolveApproval(approve, edited feedbacks) -> REVIEWED with validated, typed feedbacks
// - resolveApproval(approve, feedbacks equal to defaults) -> APPROVED (no edits)
// - resolveApproval(deny with reason) -> DENIED
// - invalid feedbacks reject and leave the request pending
// - timeout resolves as TIMED_OUT and updates store + channel
// - reminder sends a threaded notify when the timer elapses while pending
// - reminder is skipped after the approval is resolved
// - reminders after timeout are skipped
// - escalate notify posts to the fallback channel
// - escalate redeliver re-sends approval UI on the fallback channel
// - notify routes by channel and resolves parent approval to its externalId

class FakeBinding implements EngineBinding {
  waits = new Map<string, (payload: unknown) => void>();
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

  /** Resolves the next pending `sleep()` call. */
  flushSleep(): void {
    const resolve = this.sleepResolvers.shift();
    resolve?.();
  }

  /** Resolves `sleep()` immediately on each call (for timeout tests). */
  autoResolveSleep(): void {
    this.sleep = vi.fn(() => Promise.resolve());
  }

  async run<T>(_label: string, fn: () => Promise<T>): Promise<T> {
    return fn();
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
  const binding = new FakeBinding();
  const store = new InMemoryStore();
  const plugins = pluginIds.map(fakePlugin);
  const runtime: HitlRuntime = { binding, store, plugins };
  return { binding, store, plugins, runtime };
}

const fields = {
  subject: field.textField({ label: "Subject", default: "Hi" }),
  body: field.textArea({ label: "Body", default: "Hello there" }),
};

describe("requestApproval", () => {
  it("records the request, sends via the default plugin, and stores the externalId", async () => {
    const { runtime, store, plugins } = makeRuntime(["a", "b"]);

    const pending = requestApproval(runtime, { message: "Approve?", fields });
    await vi.waitFor(async () => {
      expect(plugins[0]!.sent).toHaveLength(1);
    });

    const request = plugins[0]!.sent[0]!;
    expect(request.message).toBe("Approve?");
    expect(request.channel).toBe("a");

    const record = await store.get(request.id);
    expect(record?.status).toBe("pending");
    expect(record?.externalId).toBe(`ext_${request.id}`);

    await resolveApproval(runtime, { requestId: request.id, decision: "approve" });
    await pending;
  });

  it("routes to the plugin matching the channel id", async () => {
    const { runtime, plugins } = makeRuntime(["a", "b"]);

    const pending = requestApproval(runtime, { message: "m", channel: "b" });
    await vi.waitFor(() => expect(plugins[1]!.sent).toHaveLength(1));
    expect(plugins[0]!.sent).toHaveLength(0);

    await resolveApproval(runtime, {
      requestId: plugins[1]!.sent[0]!.id,
      decision: "approve",
    });
    await pending;
  });

  it("throws on an unknown channel id", async () => {
    const { runtime } = makeRuntime(["a"]);
    await expect(
      requestApproval(runtime, { message: "m", channel: "nope" }),
    ).rejects.toThrow(/nope/);
  });

  it("throws when no plugins are configured", async () => {
    const { runtime } = makeRuntime([]);
    await expect(requestApproval(runtime, { message: "m" })).rejects.toThrow(
      /no .*plugin/i,
    );
  });

  it("resolves as TIMED_OUT when the timeout elapses first", async () => {
    const { runtime, binding, store, plugins } = makeRuntime();
    binding.autoResolveSleep();

    const result = await requestApproval(runtime, { message: "m", timeout: "72h" });

    expect(binding.sleep).toHaveBeenCalledWith(72 * 60 * 60 * 1000);
    expect(result.type).toBe("TIMED_OUT");

    const record = await store.get(result.id);
    expect(record?.status).toBe("resolved");
    expect(plugins[0]!.updates).toEqual([[`ext_${result.id}`, result]]);
  });

  it("sends a reminder notify when the timer elapses while pending", async () => {
    const { runtime, binding, plugins } = makeRuntime(["a"]);
    const pending = requestApproval(runtime, {
      message: "Approve?",
      reminder: [{ after: "1h", message: "Still waiting" }],
    });

    await vi.waitFor(() => expect(plugins[0]!.sent).toHaveLength(1));
    const requestId = plugins[0]!.sent[0]!.id;

    expect(binding.sleepCalls).toEqual([3_600_000]);
    binding.flushSleep();

    await vi.waitFor(() => expect(plugins[0]!.notifications).toHaveLength(1));
    expect(plugins[0]!.notifications[0]).toEqual({
      parent: requestId,
      message: "Still waiting",
      channel: "a",
      parentExternalId: `ext_${requestId}`,
    });

    await resolveApproval(runtime, { requestId, decision: "approve" });
    await pending;
  });

  it("uses the default reminder message when message is omitted", async () => {
    const { runtime, binding, plugins } = makeRuntime();
    const pending = requestApproval(runtime, {
      message: "m",
      reminder: [{ after: "10m" }],
    });

    await vi.waitFor(() => expect(plugins[0]!.sent).toHaveLength(1));
    binding.flushSleep();

    await vi.waitFor(() => expect(plugins[0]!.notifications).toHaveLength(1));
    expect(plugins[0]!.notifications[0]?.message).toBe("Reminder: approval still pending");

    await resolveApproval(runtime, {
      requestId: plugins[0]!.sent[0]!.id,
      decision: "approve",
    });
    await pending;
  });

  it("skips a reminder after the approval is resolved", async () => {
    const { runtime, binding, plugins } = makeRuntime();
    const pending = requestApproval(runtime, {
      message: "m",
      reminder: [{ after: "1h", message: "ping" }],
    });

    await vi.waitFor(() => expect(plugins[0]!.sent).toHaveLength(1));
    const requestId = plugins[0]!.sent[0]!.id;

    await resolveApproval(runtime, { requestId, decision: "approve" });
    await pending;

    binding.flushSleep();
    expect(plugins[0]!.notifications).toHaveLength(0);
  });

  it("skips reminders scheduled after the timeout", async () => {
    const { runtime, binding, plugins } = makeRuntime();
    binding.autoResolveSleep();

    await requestApproval(runtime, {
      message: "m",
      timeout: "1h",
      reminder: [{ after: "2h", message: "too late" }],
    });

    expect(plugins[0]!.notifications).toHaveLength(0);
  });

  it("escalates with a notify on the fallback channel", async () => {
    const { runtime, binding, plugins } = makeRuntime(["primary", "oncall"]);
    const pending = requestApproval(runtime, {
      message: "m",
      channel: "primary",
      reminder: [{ after: "30m", channel: "oncall", message: "Needs eyes" }],
    });

    await vi.waitFor(() => expect(plugins[0]!.sent).toHaveLength(1));
    const requestId = plugins[0]!.sent[0]!.id;
    binding.flushSleep();

    await vi.waitFor(() => expect(plugins[1]!.notifications).toHaveLength(1));
    expect(plugins[1]!.notifications[0]).toEqual({
      message: "Needs eyes",
      channel: "oncall",
      parent: requestId,
      parentExternalId: `ext_${requestId}`,
    });

    await resolveApproval(runtime, { requestId, decision: "approve" });
    await pending;
  });

  it("escalates with redeliver on the fallback channel", async () => {
    const { runtime, binding, store, plugins } = makeRuntime(["primary", "oncall"]);
    const pending = requestApproval(runtime, {
      message: "Escalate me",
      channel: "primary",
      fields,
      reminder: [{ after: "1h", channel: "oncall", mode: "redeliver" }],
    });

    await vi.waitFor(() => expect(plugins[0]!.sent).toHaveLength(1));
    const requestId = plugins[0]!.sent[0]!.id;
    binding.flushSleep();

    await vi.waitFor(() => expect(plugins[1]!.sent).toHaveLength(1));
    expect(plugins[1]!.sent[0]).toMatchObject({
      id: requestId,
      channel: "oncall",
      message: "Escalate me",
    });

    const record = await store.get(requestId);
    expect(record?.externalIds?.oncall).toBe(`ext_${requestId}`);

    await resolveApproval(runtime, { requestId, decision: "approve" });
    await pending;

    expect(plugins[0]!.updates).toHaveLength(1);
    expect(plugins[1]!.updates).toHaveLength(1);
  });

  it("fires same-time reminders in array order", async () => {
    const { runtime, binding, plugins } = makeRuntime(["primary", "oncall"]);
    const pending = requestApproval(runtime, {
      message: "m",
      reminder: [
        { after: "1h", message: "first" },
        { after: "1h", channel: "oncall", message: "second" },
      ],
    });

    await vi.waitFor(() => expect(plugins[0]!.sent).toHaveLength(1));
    binding.flushSleep();

    await vi.waitFor(() => expect(plugins[1]!.notifications).toHaveLength(1));
    expect(plugins[0]!.notifications[0]?.message).toBe("first");
    expect(plugins[1]!.notifications[0]?.message).toBe("second");

    await resolveApproval(runtime, {
      requestId: plugins[0]!.sent[0]!.id,
      decision: "approve",
    });
    await pending;
  });
});

describe("resolveApproval", () => {
  async function startApproval(runtime: HitlRuntime, plugin: ReturnType<typeof fakePlugin>) {
    const pending = requestApproval(runtime, { message: "m", fields });
    await vi.waitFor(() => expect(plugin.sent).toHaveLength(1));
    return { pending, requestId: plugin.sent[0]!.id };
  }

  it("approve without feedbacks resolves APPROVED and updates the channel", async () => {
    const { runtime, plugins } = makeRuntime();
    const { pending, requestId } = await startApproval(runtime, plugins[0]!);

    await resolveApproval(runtime, {
      requestId,
      decision: "approve",
      by: { name: "ryosuke" },
    });

    const result = await pending;
    expect(result).toEqual({ type: "APPROVED", id: requestId, by: { name: "ryosuke" } });
    expect(plugins[0]!.updates).toEqual([[`ext_${requestId}`, result]]);
  });

  it("approve with edited feedbacks resolves REVIEWED with validated values", async () => {
    const { runtime, plugins } = makeRuntime();
    const { pending, requestId } = await startApproval(runtime, plugins[0]!);

    await resolveApproval(runtime, {
      requestId,
      decision: "approve",
      feedbacks: { subject: "Edited", body: "Hello there" },
    });

    const result = await pending;
    expect(result).toMatchObject({
      type: "REVIEWED",
      feedbacks: { subject: "Edited", body: "Hello there" },
    });
  });

  it("approve with feedbacks identical to defaults resolves plain APPROVED", async () => {
    const { runtime, plugins } = makeRuntime();
    const { pending, requestId } = await startApproval(runtime, plugins[0]!);

    await resolveApproval(runtime, {
      requestId,
      decision: "approve",
      feedbacks: { subject: "Hi", body: "Hello there" },
    });

    expect((await pending).type).toBe("APPROVED");
  });

  it("deny resolves DENIED with the reason", async () => {
    const { runtime, plugins } = makeRuntime();
    const { pending, requestId } = await startApproval(runtime, plugins[0]!);

    await resolveApproval(runtime, { requestId, decision: "deny", reason: "spam" });

    expect(await pending).toEqual({ type: "DENIED", id: requestId, reason: "spam" });
  });

  it("rejects invalid feedbacks and leaves the request pending", async () => {
    const { runtime, store, plugins } = makeRuntime();
    const { requestId } = await startApproval(runtime, plugins[0]!);

    await expect(
      resolveApproval(runtime, {
        requestId,
        decision: "approve",
        feedbacks: { subject: "ok", body: "ok", extra: "nope" },
      }),
    ).rejects.toThrow(/extra/);

    expect((await store.get(requestId))?.status).toBe("pending");
  });

  it("rejects an unknown request id", async () => {
    const { runtime } = makeRuntime();
    await expect(
      resolveApproval(runtime, { requestId: "missing", decision: "approve" }),
    ).rejects.toThrow(/missing/);
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
    const pending = requestApproval(runtime, { message: "m" });
    await vi.waitFor(() => expect(plugins[0]!.sent).toHaveLength(1));
    const requestId = plugins[0]!.sent[0]!.id;

    await notifyVia(runtime, { message: "context", parent: requestId });

    expect(plugins[0]!.notifications[0]).toMatchObject({
      message: "context",
      parent: requestId,
      parentExternalId: `ext_${requestId}`,
    });

    await resolveApproval(runtime, { requestId, decision: "approve" });
    await pending;
  });
});
