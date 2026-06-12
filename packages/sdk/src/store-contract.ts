import { hitl } from "./fields";
import type { NewApprovalRecord, Store } from "./store";

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
      fields: { subject: hitl.textField({ label: "Subject" }) },
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
  });
}
