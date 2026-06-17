import { describe, expect, it } from "vitest";
import { actions } from "@hitl-sdk/hitl";
import { newDb } from "pg-mem";
import { PostgresState, type PgQueryable } from "./index.js";
import { ensureHitlSchema } from "./setup.js";

function newPool(): PgQueryable {
  const { Pool } = newDb().adapters.createPg();
  return new Pool();
}

describe("setup command", () => {
  it("creates the default approvals table", async () => {
    const pool = newPool();
    await ensureHitlSchema(pool);

    const state = new PostgresState(pool);
    await state.create({
      id: "a1",
      token: "tok_a1",
      channel: "lead-approvals",
      namespace: "global",
      message: "Approve?",
      actions: actions().approve().build(),
    });
    expect(await state.get("a1")).toMatchObject({ id: "a1", status: "pending" });
  });

  it("supports a custom table name", async () => {
    const pool = newPool();
    await ensureHitlSchema(pool, "custom_approvals");

    const state = new PostgresState(pool, { tableName: "custom_approvals" });
    await state.create({
      id: "a1",
      token: "tok_a1",
      channel: "lead-approvals",
      namespace: "global",
      message: "Approve?",
      actions: actions().approve().build(),
    });
    expect(await state.get("a1")).not.toBeNull();
  });
});
