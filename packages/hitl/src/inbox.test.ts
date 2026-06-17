import { describe, expect, it } from "vitest";
import type { HitlResolver } from "./binding";
import { createHumanRequest, createBatchRequest, type HitlRuntime } from "./core";
import { field } from "./fields";
import { actions } from "./human-actions-builder";
import { createInbox } from "./inbox";
import { InMemoryState } from "./state";
import type { HumanRequest, HitlAdapter, Notification } from "./types";
import { FeedbackValidationError } from "./validate";

// Test list:
// - list() / list({ status }) forward to the state
// - get(id) forwards; unknown id -> null
// - getBatch(batchId) returns { batch, items } in item order; unknown -> null
// - resolve(id, { actionId: "approve" }) -> RESOLVED, resolver resumed with the stored token, adapter.update called
// - resolve with edited feedbacks -> RESOLVED edited: true; defaults-only -> RESOLVED without edited
// - resolve(id, { actionId: "deny", feedbacks }) -> RESOLVED actionId deny
// - resolve on an unknown id throws NotFoundError (not swallowed)
// - invalid feedbacks throw FeedbackValidationError (not swallowed)
// - resolveBatch resolves every item in order; a missing decision rejects the whole resolve

class FakeResolver implements HitlResolver {
  readonly resolved: Array<{ token: string; payload: unknown }> = [];

  async resolve(token: string, payload: unknown): Promise<void> {
    this.resolved.push({ token, payload });
  }
}

function fakeAdapter(id: string): HitlAdapter & {
  sent: HumanRequest[];
  updates: unknown[][];
  notifications: Notification[];
} {
  const sent: HumanRequest[] = [];
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
    async sendBatch(request) {
      return { externalId: `bext_${request.batchId}` };
    },
    async update(externalId, result) {
      updates.push([externalId, result]);
    },
    async notify(notification) {
      notifications.push(notification);
      return {};
    },
  };
}

function makeRuntime() {
  const resolver = new FakeResolver();
  const state = new InMemoryState();
  const adapter = fakeAdapter("inbox");
  const runtime: HitlRuntime = { resolver, state, adapters: [adapter] };
  return { resolver, state, adapter, runtime, inbox: createInbox(runtime) };
}

const fields = {
  subject: field.textField({ label: "Subject", default: "Hi" }),
  body: field.textArea({ label: "Body", default: "Hello there" }),
};
const approvalActions = actions()
  .approve({ fields })
  .deny({ fields: { reason: field.textField({ label: "Reason" }) } })
  .build();

async function seedApproval(runtime: HitlRuntime, token = "tok_1") {
  const { id } = await createHumanRequest(runtime, { token, message: "Approve?", actions: approvalActions });
  return id;
}

async function seedBatch(runtime: HitlRuntime) {
  return createBatchRequest(runtime, {
    message: "Outbound emails",
    actions: approvalActions,
    items: [
      { token: "tok_0", message: "Email A" },
      { token: "tok_1", message: "Email B" },
    ],
  });
}

describe("HitlInbox read", () => {
  it("lists approvals and filters by status", async () => {
    const { runtime, inbox } = makeRuntime();
    const id = await seedApproval(runtime);

    expect((await inbox.list()).items.map((a) => a.id)).toEqual([id]);
    expect((await inbox.list({ status: "pending" })).items.map((a) => a.id)).toEqual([id]);
    expect((await inbox.list({ status: "resolved" })).items).toEqual([]);
  });

  it("counts approvals and filters by status", async () => {
    const { runtime, inbox } = makeRuntime();
    await seedApproval(runtime);

    expect(await inbox.count()).toBe(1);
    expect(await inbox.count({ status: "pending" })).toBe(1);
    expect(await inbox.count({ status: "resolved" })).toBe(0);
  });

  it("counts and lists by namespace, defaulting to global", async () => {
    const { runtime, inbox } = makeRuntime();
    await seedApproval(runtime);

    expect(await inbox.count({ namespace: "global" })).toBe(1);
    expect(await inbox.count({ namespace: "other" })).toBe(0);
    expect((await inbox.list({ namespace: "global" })).items).toHaveLength(1);
    expect((await inbox.list({ namespace: "other" })).items).toHaveLength(0);
  });

  it("gets a single approval, returning null for an unknown id", async () => {
    const { runtime, inbox } = makeRuntime();
    const id = await seedApproval(runtime);

    expect(await inbox.get(id)).toMatchObject({ id, status: "pending" });
    expect(await inbox.get("missing")).toBeNull();
  });

  it("gets a batch with its items in order; null for an unknown id", async () => {
    const { runtime, inbox } = makeRuntime();
    const { batchId } = await seedBatch(runtime);

    const result = await inbox.getBatch(batchId);
    expect(result?.batch).toMatchObject({ id: batchId, message: "Outbound emails" });
    expect(result?.items.map((i) => i.id)).toEqual([`${batchId}:0`, `${batchId}:1`]);
    expect(await inbox.getBatch("missing")).toBeNull();
  });
});

describe("HitlInbox write", () => {
  it("resolves submit: RESOLVED, resumes the engine, reflects to the channel", async () => {
    const { runtime, inbox, resolver, adapter } = makeRuntime();
    const id = await seedApproval(runtime);

    const result = await inbox.resolve(id, { actionId: "approve", by: { name: "ryosuke" } });

    expect(result).toMatchObject({
      type: "RESOLVED",
      actionId: "approve",
      id,
      by: { name: "ryosuke" },
      feedbacks: { subject: "Hi", body: "Hello there" },
    });
    expect(resolver.resolved).toEqual([{ token: "tok_1", payload: result }]);
    expect(adapter.updates).toHaveLength(1);
    expect((await inbox.get(id))?.status).toBe("resolved");
  });

  it("resolves with edited feedbacks -> edited: true; defaults-only -> no edited", async () => {
    const { runtime, inbox } = makeRuntime();
    const edited = await seedApproval(runtime, "tok_edit");
    const reviewed = await inbox.resolve(edited, {
      actionId: "approve",
      feedbacks: { subject: "Edited", body: "Hello there" },
    });
    expect(reviewed).toMatchObject({
      type: "RESOLVED",
      actionId: "approve",
      feedbacks: { subject: "Edited", body: "Hello there" },
      edited: true,
    });

    const untouched = await seedApproval(runtime, "tok_same");
    const approved = await inbox.resolve(untouched, {
      actionId: "approve",
      feedbacks: { subject: "Hi", body: "Hello there" },
    });
    expect(approved).toMatchObject({ type: "RESOLVED", actionId: "approve" });
    expect(approved).not.toHaveProperty("edited");
  });

  it("denies with a reason -> RESOLVED actionId deny", async () => {
    const { runtime, inbox } = makeRuntime();
    const id = await seedApproval(runtime);

    expect(await inbox.resolve(id, { actionId: "deny", feedbacks: { reason: "spam" } })).toMatchObject({
      type: "RESOLVED",
      actionId: "deny",
      id,
      feedbacks: { reason: "spam" },
    });
  });

  it("throws NotFoundError for an unknown id", async () => {
    const { inbox } = makeRuntime();
    await expect(inbox.resolve("missing", { actionId: "approve" })).rejects.toThrow(/Unknown human request/);
  });

  it("throws FeedbackValidationError on invalid feedbacks", async () => {
    const { runtime, inbox } = makeRuntime();
    const id = await seedApproval(runtime);
    await expect(
      inbox.resolve(id, { actionId: "approve", feedbacks: { bogus: "x" } }),
    ).rejects.toBeInstanceOf(FeedbackValidationError);
  });

  it("resolves a batch, resolving every item in order", async () => {
    const { runtime, inbox, resolver } = makeRuntime();
    const { batchId } = await seedBatch(runtime);

    const results = await inbox.resolveBatch(
      batchId,
      [
        { requestId: `${batchId}:0`, actionId: "approve" },
        { requestId: `${batchId}:1`, actionId: "deny", feedbacks: { reason: "no" } },
      ],
      { by: { name: "ryosuke" } },
    );

    expect(results.map((r) => (r.type === "RESOLVED" ? r.actionId : r.type))).toEqual([
      "approve",
      "deny",
    ]);
    expect(results.every((r) => r.type === "RESOLVED")).toBe(true);
    expect(resolver.resolved.map((r) => r.token)).toEqual(["tok_0", "tok_1"]);
  });

  it("rejects a batch resolve that is missing a decision for an item", async () => {
    const { runtime, inbox } = makeRuntime();
    const { batchId } = await seedBatch(runtime);

    await expect(
      inbox.resolveBatch(batchId, [{ requestId: `${batchId}:0`, actionId: "approve" }]),
    ).rejects.toThrow();
  });
});
