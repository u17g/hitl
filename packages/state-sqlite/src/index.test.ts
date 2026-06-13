import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { field, actions } from "hitl";
import { approveFields } from "hitl/adapter";
import type { NewHumanRequestRecord } from "hitl/state";
import { describeStateContract } from "hitl/state-contract";
import { SqliteState, schemaSql } from "./index";

describeStateContract(
  "SqliteState",
  { describe, it, expect },
  () => new SqliteState(new DatabaseSync(":memory:")),
);

function newRecord(id: string): NewHumanRequestRecord {
  return {
    id,
    token: `tok_${id}`,
    channel: "lead-approvals",
    message: "Inbound lead",
    actions: actions()
      .approve({ fields: { subject: field.textField({ label: "Subject" }) } })
      .build(),
  };
}

describe("SqliteState specifics", () => {
  it("shares records across instances on the same database", async () => {
    const db = new DatabaseSync(":memory:");
    const first = new SqliteState(db);
    await first.create(newRecord("a1"));

    const second = new SqliteState(db);
    expect(await second.get("a1")).toMatchObject({ id: "a1", status: "pending" });
  });

  it("isolates records under a custom table name", async () => {
    const db = new DatabaseSync(":memory:");
    const defaultTable = new SqliteState(db);
    const customTable = new SqliteState(db, { tableName: "custom_approvals" });
    await customTable.create(newRecord("a1"));

    expect(await customTable.get("a1")).not.toBeNull();
    expect(await defaultTable.get("a1")).toBeNull();
  });

  it("rejects table names that are not plain identifiers", () => {
    const db = new DatabaseSync(":memory:");
    expect(() => new SqliteState(db, { tableName: 'approvals"; DROP TABLE x' })).toThrow(
      /invalid table name/i,
    );
  });

  it("round-trips nested field definitions through JSON", async () => {
    const state = new SqliteState(new DatabaseSync(":memory:"));
    const fields = {
      subject: field.textField({ label: "Subject", default: "Hello" }),
      tier: field.select({ label: "Tier", options: ["gold", "silver"], default: "silver" }),
      confirmed: field.confirm({ label: "Confirm?" }),
    };
    await state.create({ ...newRecord("a1"), actions: actions().approve({ fields }).build() });

    expect(approveFields((await state.get("a1"))!.actions)).toEqual(fields);
  });

  it("exports idempotent schemaSql", () => {
    expect(schemaSql("hitl.human_requests")).toContain(
      'CREATE TABLE IF NOT EXISTS "hitl.human_requests"',
    );
    expect(schemaSql("custom_approvals")).toContain("CREATE TABLE IF NOT EXISTS custom_approvals");
  });
});
