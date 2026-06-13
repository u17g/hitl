import { describe, expect, it } from "vitest";
import { newDb } from "pg-mem";
import { PostgresStore, type PgQueryable } from "@hitl/state-pg";
import { ensureHitldevSchema } from "./setup";

function newPool(): PgQueryable {
  const { Pool } = newDb().adapters.createPg();
  return new Pool();
}

describe("setup command", () => {
  it("creates the default approvals table", async () => {
    const pool = newPool();
    await ensureHitldevSchema(pool);

    const store = new PostgresStore(pool);
    await store.create({
      id: "a1",
      token: "tok_a1",
      channel: "lead-approvals",
      message: "Approve?",
      fields: {},
    });
    expect(await store.get("a1")).toMatchObject({ id: "a1", status: "pending" });
  });

  it("supports a custom table name", async () => {
    const pool = newPool();
    await ensureHitldevSchema(pool, "custom_approvals");

    const store = new PostgresStore(pool, { tableName: "custom_approvals" });
    await store.create({
      id: "a1",
      token: "tok_a1",
      channel: "lead-approvals",
      message: "Approve?",
      fields: {},
    });
    expect(await store.get("a1")).not.toBeNull();
  });
});
