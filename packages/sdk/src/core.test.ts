import { describe, expect, it, vi } from "vitest";
import type { EngineBinding, EngineSuspension } from "./binding";
import { notifyVia, requestApproval, resolveApproval, type HitlRuntime } from "./core";
import { hitl } from "./fields";
import { InMemoryApprovalStore } from "./store";
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
// - notify routes by channel and resolves parent approval to its externalId

class FakeBinding implements EngineBinding {
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
    const resolveFn = this.waits.get(token);
    if (!resolveFn) throw new Error(`No wait for token ${token}`);
    resolveFn(payload);
  }

  sleep = vi.fn((ms: number) => new Promise<void>(() => {}));

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
  const store = new InMemoryApprovalStore();
  const plugins = pluginIds.map(fakePlugin);
  const runtime: HitlRuntime = { binding, store, plugins };
  return { binding, store, plugins, runtime };
}

const feedbacks = {
  subject: hitl.textField({ label: "Subject", default: "Hi" }),
  body: hitl.textArea({ label: "Body", default: "Hello there" }),
};

describe("requestApproval", () => {
  it("records the request, sends via the default plugin, and stores the externalId", async () => {
    const { runtime, store, plugins } = makeRuntime(["a", "b"]);

    const pending = requestApproval(runtime, { message: "Approve?", feedbacks });
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
    binding.sleep = vi.fn(() => Promise.resolve());

    const result = await requestApproval(runtime, { message: "m", timeout: "72h" });

    expect(binding.sleep).toHaveBeenCalledWith(72 * 60 * 60 * 1000);
    expect(result.type).toBe("TIMED_OUT");

    const record = await store.get(result.id);
    expect(record?.status).toBe("resolved");
    expect(plugins[0]!.updates).toEqual([[`ext_${result.id}`, result]]);
  });
});

describe("resolveApproval", () => {
  async function startApproval(runtime: HitlRuntime, plugin: ReturnType<typeof fakePlugin>) {
    const pending = requestApproval(runtime, { message: "m", feedbacks });
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
