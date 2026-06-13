import { describe, expect, it } from "vitest";
import { newDb } from "pg-mem";
import { describeStateContract } from "hitl/state-contract";
import { PostgresState, type PgQueryable } from "./index";

function newPool(): PgQueryable {
  const { Pool } = newDb().adapters.createPg();
  return new Pool();
}

describeStateContract("PostgresState", { describe, it, expect }, async () => {
  const state = new PostgresState(newPool());
  await state.ensureSchema();
  return state;
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

describe("PostgresState specifics", () => {
  it("ensureSchema is idempotent", async () => {
    const state = new PostgresState(newPool());
    await state.ensureSchema();
    await state.ensureSchema();

    await state.create(newRecord("a1"));
    expect(await state.get("a1")).not.toBeNull();
  });

  it("isolates records under a custom table name", async () => {
    const pool = newPool();
    const defaultTable = new PostgresState(pool);
    const customTable = new PostgresState(pool, { tableName: "custom_approvals" });
    await defaultTable.ensureSchema();
    await customTable.ensureSchema();
    await customTable.create(newRecord("a1"));

    expect(await customTable.get("a1")).not.toBeNull();
    expect(await defaultTable.get("a1")).toBeNull();
  });

  it("rejects table names that are not plain identifiers", () => {
    expect(() => new PostgresState(newPool(), { tableName: 'approvals"; DROP TABLE x' })).toThrow(
      /invalid table name/i,
    );
  });

  it("lets exactly one of two concurrent resolves win", async () => {
    const state = new PostgresState(newPool());
    await state.ensureSchema();
    await state.create(newRecord("a1"));

    const outcomes = await Promise.allSettled([
      state.resolve("a1", { type: "APPROVED", id: "a1" }),
      state.resolve("a1", { type: "DENIED", id: "a1" }),
    ]);

    const fulfilled = outcomes.filter((o) => o.status === "fulfilled");
    expect(fulfilled).toHaveLength(1);
    expect((await state.get("a1"))?.status).toBe("resolved");
  });
});
