import { describe, expect, it } from "vitest";
import type { HitlResolver } from "./binding";
import { createApprovalRequest, createBatchRequest, type HitlRuntime } from "./core";
import { field } from "./fields";
import { createInbox } from "./inbox";
import { InMemoryState } from "./state";
import type { ApprovalRequest, HitlPlugin, Notification } from "./types";
import { FeedbackValidationError } from "./validate";

// Test list:
// - list() / list({ status }) forward to the state
// - get(id) forwards; unknown id -> null
// - getBatch(batchId) returns { batch, items } in item order; unknown -> null
// - approve(id) -> APPROVED, resolver resumed with the stored token, plugin.update called
// - approve(id, { feedbacks }) with edits -> REVIEWED; feedbacks equal to defaults -> APPROVED
// - deny(id, { reason }) -> DENIED
// - approve on an unknown id throws NotFoundError (not swallowed)
// - invalid feedbacks throw FeedbackValidationError (not swallowed)
// - submitBatch resolves every item in order; a missing decision rejects the whole submit

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
    async sendBatch(request) {
      return { externalId: `bext_${request.batchId}` };
    },
    async update(externalId, result) {
      updates.push([externalId, result]);
    },
    async notify(notification) {
      notifications.push(notification);
    },
  };
}

function makeRuntime() {
  const resolver = new FakeResolver();
  const state = new InMemoryState();
  const plugin = fakePlugin("inbox");
  const runtime: HitlRuntime = { resolver, state, plugins: [plugin] };
  return { resolver, state, plugin, runtime, inbox: createInbox(runtime) };
}

const fields = {
  subject: field.textField({ label: "Subject", default: "Hi" }),
  body: field.textArea({ label: "Body", default: "Hello there" }),
};

async function seedApproval(runtime: HitlRuntime, token = "tok_1") {
  const { id } = await createApprovalRequest(runtime, { token, message: "Approve?", fields });
  return id;
}

async function seedBatch(runtime: HitlRuntime) {
  return createBatchRequest(runtime, {
    title: "Outbound emails",
    fields,
    items: [
      { token: "tok_0", message: "Email A", fields },
      { token: "tok_1", message: "Email B", fields },
    ],
  });
}

describe("HitlInbox read", () => {
  it("lists approvals and filters by status", async () => {
    const { runtime, inbox } = makeRuntime();
    const id = await seedApproval(runtime);

    expect((await inbox.list()).map((a) => a.id)).toEqual([id]);
    expect((await inbox.list({ status: "pending" })).map((a) => a.id)).toEqual([id]);
    expect(await inbox.list({ status: "resolved" })).toEqual([]);
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
    expect(result?.batch).toMatchObject({ id: batchId, title: "Outbound emails" });
    expect(result?.items.map((i) => i.id)).toEqual([`${batchId}:0`, `${batchId}:1`]);
    expect(await inbox.getBatch("missing")).toBeNull();
  });
});

describe("HitlInbox write", () => {
  it("approves: APPROVED, resumes the engine, reflects to the channel", async () => {
    const { runtime, inbox, resolver, plugin } = makeRuntime();
    const id = await seedApproval(runtime);

    const result = await inbox.approve(id, { by: { name: "ryosuke" } });

    expect(result).toMatchObject({ type: "APPROVED", id, by: { name: "ryosuke" } });
    expect(resolver.resolved).toEqual([{ token: "tok_1", payload: result }]);
    expect(plugin.updates).toHaveLength(1);
    expect((await inbox.get(id))?.status).toBe("resolved");
  });

  it("approves with edited feedbacks -> REVIEWED; defaults -> APPROVED", async () => {
    const { runtime, inbox } = makeRuntime();
    const edited = await seedApproval(runtime, "tok_edit");
    const reviewed = await inbox.approve(edited, { feedbacks: { subject: "Edited", body: "Hello there" } });
    expect(reviewed).toMatchObject({ type: "REVIEWED", feedbacks: { subject: "Edited", body: "Hello there" } });

    const untouched = await seedApproval(runtime, "tok_same");
    const approved = await inbox.approve(untouched, { feedbacks: { subject: "Hi", body: "Hello there" } });
    expect(approved.type).toBe("APPROVED");
  });

  it("denies with a reason -> DENIED", async () => {
    const { runtime, inbox } = makeRuntime();
    const id = await seedApproval(runtime);

    expect(await inbox.deny(id, { reason: "spam" })).toMatchObject({
      type: "DENIED",
      id,
      reason: "spam",
    });
  });

  it("throws NotFoundError for an unknown id", async () => {
    const { inbox } = makeRuntime();
    await expect(inbox.approve("missing")).rejects.toThrow(/Unknown approval/);
  });

  it("throws FeedbackValidationError on invalid feedbacks", async () => {
    const { runtime, inbox } = makeRuntime();
    const id = await seedApproval(runtime);
    await expect(inbox.approve(id, { feedbacks: { bogus: "x" } })).rejects.toBeInstanceOf(
      FeedbackValidationError,
    );
  });

  it("submits a batch, resolving every item in order", async () => {
    const { runtime, inbox, resolver } = makeRuntime();
    const { batchId } = await seedBatch(runtime);

    const results = await inbox.submitBatch(
      batchId,
      [
        { requestId: `${batchId}:0`, decision: "approve" },
        { requestId: `${batchId}:1`, decision: "deny", reason: "no" },
      ],
      { by: { name: "ryosuke" } },
    );

    expect(results.map((r) => r.type)).toEqual(["APPROVED", "DENIED"]);
    expect(resolver.resolved.map((r) => r.token)).toEqual(["tok_0", "tok_1"]);
  });

  it("rejects a batch submit that is missing a decision for an item", async () => {
    const { runtime, inbox } = makeRuntime();
    const { batchId } = await seedBatch(runtime);

    await expect(
      inbox.submitBatch(batchId, [{ requestId: `${batchId}:0`, decision: "approve" }]),
    ).rejects.toThrow();
  });
});
