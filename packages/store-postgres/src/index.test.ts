import { describe, expect, it } from "vitest";
import { newDb } from "pg-mem";
import { describeStoreContract } from "@openhitl/sdk/store-contract";
import { PostgresStore, type PgQueryable } from "./index";

function newPool(): PgQueryable {
  const { Pool } = newDb().adapters.createPg();
  return new Pool();
}

describeStoreContract("PostgresStore", { describe, it, expect }, async () => {
  const store = new PostgresStore(newPool());
  await store.ensureSchema();
  return store;
});

function newRecord(id: string) {
  return {
    id,
    token: `tok_${id}`,
    channel: "lead-approvals",
    message: "Inbound lead",
    fields: {},
  };
}

describe("PostgresStore specifics", () => {
  it("ensureSchema is idempotent", async () => {
    const store = new PostgresStore(newPool());
    await store.ensureSchema();
    await store.ensureSchema();

    await store.create(newRecord("a1"));
    expect(await store.get("a1")).not.toBeNull();
  });

  it("isolates records under a custom table name", async () => {
    const pool = newPool();
    const defaultTable = new PostgresStore(pool);
    const customTable = new PostgresStore(pool, { tableName: "custom_approvals" });
    await defaultTable.ensureSchema();
    await customTable.ensureSchema();
    await customTable.create(newRecord("a1"));

    expect(await customTable.get("a1")).not.toBeNull();
    expect(await defaultTable.get("a1")).toBeNull();
  });

  it("rejects table names that are not plain identifiers", () => {
    expect(() => new PostgresStore(newPool(), { tableName: 'approvals"; DROP TABLE x' })).toThrow(
      /invalid table name/i,
    );
  });

  it("lets exactly one of two concurrent resolves win", async () => {
    const store = new PostgresStore(newPool());
    await store.ensureSchema();
    await store.create(newRecord("a1"));

    const outcomes = await Promise.allSettled([
      store.resolve("a1", { type: "APPROVED", id: "a1" }),
      store.resolve("a1", { type: "DENIED", id: "a1" }),
    ]);

    const fulfilled = outcomes.filter((o) => o.status === "fulfilled");
    expect(fulfilled).toHaveLength(1);
    expect((await store.get("a1"))?.status).toBe("resolved");
  });
});
