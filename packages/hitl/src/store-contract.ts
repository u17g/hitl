import { field } from "./fields";
import type { NewApprovalRecord, NewBatchRecord, Store } from "./store";

/**
 * Test-runner hooks injected by the caller so this module stays free of any
 * runtime dependency on vitest/jest. Pass `{ describe, it, expect }` straight
 * from your test framework.
 */
export interface StoreContractApi {
  describe(name: string, fn: () => void): void;
  it(name: string, fn: () => void | Promise<void>): void;
  expect(actual: unknown): any;
}

/**
 * Executable specification every `Store` implementation must satisfy.
 * `factory` must return a fresh, empty store on each call.
 */
export function describeStoreContract(
  name: string,
  api: StoreContractApi,
  factory: () => Store | Promise<Store>,
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
      const store = await factory();
      await store.create(newRecord("a1"));

      const record = await store.get("a1");
      expect(record).toMatchObject({
        id: "a1",
        token: "tok_a1",
        channel: "lead-approvals",
        status: "pending",
      });
      expect(record?.createdAt).toBeTruthy();
    });

    it("returns null for an unknown id", async () => {
      const store = await factory();
      expect(await store.get("missing")).toBeNull();
    });

    it("attaches an external id", async () => {
      const store = await factory();
      await store.create(newRecord("a1"));
      await store.setExternalId("a1", "slack-ts-123");

      expect((await store.get("a1"))?.externalId).toBe("slack-ts-123");
      expect(await store.findByExternalId("slack-ts-123")).toMatchObject({ id: "a1" });
    });

    it("attaches per-channel external ids for escalation deliveries", async () => {
      const store = await factory();
      await store.create(newRecord("a1"));
      await store.setExternalId("a1", "slack-ts-primary");
      await store.setExternalId("a1", "slack-ts-oncall", "oncall");

      const record = await store.get("a1");
      expect(record?.externalId).toBe("slack-ts-primary");
      expect(record?.externalIds).toEqual({
        "lead-approvals": "slack-ts-primary",
        oncall: "slack-ts-oncall",
      });
      expect(await store.findByExternalId("slack-ts-oncall")).toMatchObject({ id: "a1" });
    });

    it("resolves a record with a result", async () => {
      const store = await factory();
      await store.create(newRecord("a1"));
      await store.resolve("a1", { type: "APPROVED", id: "a1" });

      const record = await store.get("a1");
      expect(record?.status).toBe("resolved");
      expect(record?.result).toEqual({ type: "APPROVED", id: "a1" });
      expect(record?.resolvedAt).toBeTruthy();
    });

    it("throws when resolving twice", async () => {
      const store = await factory();
      await store.create(newRecord("a1"));
      await store.resolve("a1", { type: "APPROVED", id: "a1" });

      await expect(store.resolve("a1", { type: "DENIED", id: "a1" })).rejects.toThrow(
        /already resolved/i,
      );
    });

    it("lists pending records only", async () => {
      const store = await factory();
      await store.create(newRecord("a1"));
      await store.create(newRecord("a2"));
      await store.resolve("a1", { type: "APPROVED", id: "a1" });

      const pending = await store.list({ status: "pending" });
      expect(pending.map((r) => r.id)).toEqual(["a2"]);

      const all = await store.list();
      expect(all).toHaveLength(2);
    });

    it("lists resolved records only", async () => {
      const store = await factory();
      await store.create(newRecord("a1"));
      await store.create(newRecord("a2"));
      await store.resolve("a1", { type: "APPROVED", id: "a1" });

      const resolved = await store.list({ status: "resolved" });
      expect(resolved.map((r) => r.id)).toEqual(["a1"]);
    });

    it("returns null for an unknown external id", async () => {
      const store = await factory();
      expect(await store.findByExternalId("missing")).toBeNull();
    });

    it("finds a record by resume token", async () => {
      const store = await factory();
      await store.create(newRecord("a1"));
      await store.create(newRecord("a2"));

      expect(await store.findByToken("tok_a2")).toMatchObject({ id: "a2" });
    });

    it("returns null for an unknown token", async () => {
      const store = await factory();
      await store.create(newRecord("a1"));
      expect(await store.findByToken("missing")).toBeNull();
    });

    it("throws when attaching an external id to an unknown approval", async () => {
      const store = await factory();
      await expect(store.setExternalId("missing", "slack-ts-123")).rejects.toThrow(
        /unknown approval/i,
      );
    });

    it("throws when resolving an unknown approval", async () => {
      const store = await factory();
      await expect(store.resolve("missing", { type: "APPROVED", id: "missing" })).rejects.toThrow(
        /unknown approval/i,
      );
    });

    it("creates and gets a batch", async () => {
      const store = await factory();
      await store.createBatch(newBatch("b1"));

      const batch = await store.getBatch("b1");
      expect(batch).toMatchObject({
        id: "b1",
        channel: "lead-approvals",
        title: "Outbound emails",
      });
      expect(batch?.createdAt).toBeTruthy();
    });

    it("returns null for an unknown batch id", async () => {
      const store = await factory();
      expect(await store.getBatch("missing")).toBeNull();
    });

    it("attaches a batch external id", async () => {
      const store = await factory();
      await store.createBatch(newBatch("b1"));
      await store.setBatchExternalId("b1", "slack-ts-123");

      const batch = await store.getBatch("b1");
      expect(batch?.externalId).toBe("slack-ts-123");
    });

    it("attaches per-channel batch external ids for escalation deliveries", async () => {
      const store = await factory();
      await store.createBatch(newBatch("b1"));
      await store.setBatchExternalId("b1", "slack-ts-primary");
      await store.setBatchExternalId("b1", "slack-ts-oncall", "oncall");

      const batch = await store.getBatch("b1");
      expect(batch?.externalId).toBe("slack-ts-primary");
      expect(batch?.externalIds).toEqual({
        "lead-approvals": "slack-ts-primary",
        oncall: "slack-ts-oncall",
      });
    });

    it("throws when attaching an external id to an unknown batch", async () => {
      const store = await factory();
      await expect(store.setBatchExternalId("missing", "slack-ts-123")).rejects.toThrow(
        /unknown batch/i,
      );
    });

    it("round-trips batchId and batchIndex on approval records", async () => {
      const store = await factory();
      await store.createBatch(newBatch("b1"));
      await store.create({ ...newRecord("a1"), batchId: "b1", batchIndex: 0 });

      const record = await store.get("a1");
      expect(record?.batchId).toBe("b1");
      expect(record?.batchIndex).toBe(0);
    });

    it("lists batch items in batch index order regardless of insertion order", async () => {
      const store = await factory();
      await store.createBatch(newBatch("b1"));
      await store.create({ ...newRecord("a2"), batchId: "b1", batchIndex: 2 });
      await store.create({ ...newRecord("a0"), batchId: "b1", batchIndex: 0 });
      await store.create({ ...newRecord("a1"), batchId: "b1", batchIndex: 1 });
      await store.create(newRecord("loose"));

      const items = await store.listByBatch("b1");
      expect(items.map((r) => r.id)).toEqual(["a0", "a1", "a2"]);
    });

    it("returns an empty list for an unknown batch", async () => {
      const store = await factory();
      await store.create(newRecord("a1"));
      expect(await store.listByBatch("missing")).toEqual([]);
    });
  });
}
