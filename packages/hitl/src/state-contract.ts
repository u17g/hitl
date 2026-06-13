import { field } from "./fields";
import type { NewApprovalRecord, NewBatchRecord, State } from "./state";

/**
 * Test-runner hooks injected by the caller so this module stays free of any
 * runtime dependency on vitest/jest. Pass `{ describe, it, expect }` straight
 * from your test framework.
 */
export interface StateContractApi {
  describe(name: string, fn: () => void): void;
  it(name: string, fn: () => void | Promise<void>): void;
  expect(actual: unknown): any;
}

/**
 * Executable specification every `State` implementation must satisfy.
 * `factory` must return a fresh, empty state on each call.
 */
export function describeStateContract(
  name: string,
  api: StateContractApi,
  factory: () => State | Promise<State>,
): void {
  const { describe, it, expect } = api;

  function newRecord(id: string): NewApprovalRecord {
    return {
      id,
      token: `tok_${id}`,
      channel: "lead-approvals",
      message: "Inbound lead",
      fields: { subject: field.textField({ label: "Subject" }) },
    };
  }

  function newBatch(id: string): NewBatchRecord {
    return {
      id,
      channel: "lead-approvals",
      title: "Outbound emails",
    };
  }

  describe(name, () => {
    it("creates and gets a pending record", async () => {
      const state = await factory();
      await state.create(newRecord("a1"));

      const record = await state.get("a1");
      expect(record).toMatchObject({
        id: "a1",
        token: "tok_a1",
        channel: "lead-approvals",
        status: "pending",
      });
      expect(record?.createdAt).toBeTruthy();
    });

    it("returns null for an unknown id", async () => {
      const state = await factory();
      expect(await state.get("missing")).toBeNull();
    });

    it("attaches an external id", async () => {
      const state = await factory();
      await state.create(newRecord("a1"));
      await state.setExternalId("a1", "slack-ts-123");

      expect((await state.get("a1"))?.externalId).toBe("slack-ts-123");
      expect(await state.findByExternalId("slack-ts-123")).toMatchObject({ id: "a1" });
    });

    it("attaches per-channel external ids for escalation deliveries", async () => {
      const state = await factory();
      await state.create(newRecord("a1"));
      await state.setExternalId("a1", "slack-ts-primary");
      await state.setExternalId("a1", "slack-ts-oncall", "oncall");

      const record = await state.get("a1");
      expect(record?.externalId).toBe("slack-ts-primary");
      expect(record?.externalIds).toEqual({
        "lead-approvals": "slack-ts-primary",
        oncall: "slack-ts-oncall",
      });
      expect(await state.findByExternalId("slack-ts-oncall")).toMatchObject({ id: "a1" });
    });

    it("resolves a record with a result", async () => {
      const state = await factory();
      await state.create(newRecord("a1"));
      await state.resolve("a1", { type: "APPROVED", id: "a1" });

      const record = await state.get("a1");
      expect(record?.status).toBe("resolved");
      expect(record?.result).toEqual({ type: "APPROVED", id: "a1" });
      expect(record?.resolvedAt).toBeTruthy();
    });

    it("throws when resolving twice", async () => {
      const state = await factory();
      await state.create(newRecord("a1"));
      await state.resolve("a1", { type: "APPROVED", id: "a1" });

      await expect(state.resolve("a1", { type: "DENIED", id: "a1" })).rejects.toThrow(
        /already resolved/i,
      );
    });

    it("lists pending records only", async () => {
      const state = await factory();
      await state.create(newRecord("a1"));
      await state.create(newRecord("a2"));
      await state.resolve("a1", { type: "APPROVED", id: "a1" });

      const pending = await state.list({ status: "pending" });
      expect(pending.map((r) => r.id)).toEqual(["a2"]);

      const all = await state.list();
      expect(all).toHaveLength(2);
    });

    it("lists resolved records only", async () => {
      const state = await factory();
      await state.create(newRecord("a1"));
      await state.create(newRecord("a2"));
      await state.resolve("a1", { type: "APPROVED", id: "a1" });

      const resolved = await state.list({ status: "resolved" });
      expect(resolved.map((r) => r.id)).toEqual(["a1"]);
    });

    it("returns null for an unknown external id", async () => {
      const state = await factory();
      expect(await state.findByExternalId("missing")).toBeNull();
    });

    it("finds a record by resume token", async () => {
      const state = await factory();
      await state.create(newRecord("a1"));
      await state.create(newRecord("a2"));

      expect(await state.findByToken("tok_a2")).toMatchObject({ id: "a2" });
    });

    it("returns null for an unknown token", async () => {
      const state = await factory();
      await state.create(newRecord("a1"));
      expect(await state.findByToken("missing")).toBeNull();
    });

    it("throws when attaching an external id to an unknown approval", async () => {
      const state = await factory();
      await expect(state.setExternalId("missing", "slack-ts-123")).rejects.toThrow(
        /unknown approval/i,
      );
    });

    it("throws when resolving an unknown approval", async () => {
      const state = await factory();
      await expect(state.resolve("missing", { type: "APPROVED", id: "missing" })).rejects.toThrow(
        /unknown approval/i,
      );
    });

    it("creates and gets a batch", async () => {
      const state = await factory();
      await state.createBatch(newBatch("b1"));

      const batch = await state.getBatch("b1");
      expect(batch).toMatchObject({
        id: "b1",
        channel: "lead-approvals",
        title: "Outbound emails",
      });
      expect(batch?.createdAt).toBeTruthy();
    });

    it("returns null for an unknown batch id", async () => {
      const state = await factory();
      expect(await state.getBatch("missing")).toBeNull();
    });

    it("attaches a batch external id", async () => {
      const state = await factory();
      await state.createBatch(newBatch("b1"));
      await state.setBatchExternalId("b1", "slack-ts-123");

      const batch = await state.getBatch("b1");
      expect(batch?.externalId).toBe("slack-ts-123");
    });

    it("attaches per-channel batch external ids for escalation deliveries", async () => {
      const state = await factory();
      await state.createBatch(newBatch("b1"));
      await state.setBatchExternalId("b1", "slack-ts-primary");
      await state.setBatchExternalId("b1", "slack-ts-oncall", "oncall");

      const batch = await state.getBatch("b1");
      expect(batch?.externalId).toBe("slack-ts-primary");
      expect(batch?.externalIds).toEqual({
        "lead-approvals": "slack-ts-primary",
        oncall: "slack-ts-oncall",
      });
    });

    it("throws when attaching an external id to an unknown batch", async () => {
      const state = await factory();
      await expect(state.setBatchExternalId("missing", "slack-ts-123")).rejects.toThrow(
        /unknown batch/i,
      );
    });

    it("round-trips batchId and batchIndex on approval records", async () => {
      const state = await factory();
      await state.createBatch(newBatch("b1"));
      await state.create({ ...newRecord("a1"), batchId: "b1", batchIndex: 0 });

      const record = await state.get("a1");
      expect(record?.batchId).toBe("b1");
      expect(record?.batchIndex).toBe(0);
    });

    it("lists batch items in batch index order regardless of insertion order", async () => {
      const state = await factory();
      await state.createBatch(newBatch("b1"));
      await state.create({ ...newRecord("a2"), batchId: "b1", batchIndex: 2 });
      await state.create({ ...newRecord("a0"), batchId: "b1", batchIndex: 0 });
      await state.create({ ...newRecord("a1"), batchId: "b1", batchIndex: 1 });
      await state.create(newRecord("loose"));

      const items = await state.listByBatch("b1");
      expect(items.map((r) => r.id)).toEqual(["a0", "a1", "a2"]);
    });

    it("returns an empty list for an unknown batch", async () => {
      const state = await factory();
      await state.create(newRecord("a1"));
      expect(await state.listByBatch("missing")).toEqual([]);
    });
  });
}
