import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { field, type NewApprovalRecord } from "@hitldev/sdk";
import { describeStoreContract } from "@hitldev/sdk/store-contract";
import { SqliteStore, schemaSql } from "./index";

describeStoreContract(
  "SqliteStore",
  { describe, it, expect },
  () => new SqliteStore(new DatabaseSync(":memory:")),
);

function newRecord(id: string): NewApprovalRecord {
  return {
    id,
    token: `tok_${id}`,
    channel: "lead-approvals",
    message: "Inbound lead",
    fields: { subject: field.textField({ label: "Subject" }) },
  };
}

describe("SqliteStore specifics", () => {
  it("shares records across instances on the same database", async () => {
    const db = new DatabaseSync(":memory:");
    const first = new SqliteStore(db);
    await first.create(newRecord("a1"));

    const second = new SqliteStore(db);
    expect(await second.get("a1")).toMatchObject({ id: "a1", status: "pending" });
  });

  it("isolates records under a custom table name", async () => {
    const db = new DatabaseSync(":memory:");
    const defaultTable = new SqliteStore(db);
    const customTable = new SqliteStore(db, { tableName: "custom_approvals" });
    await customTable.create(newRecord("a1"));

    expect(await customTable.get("a1")).not.toBeNull();
    expect(await defaultTable.get("a1")).toBeNull();
  });

  it("rejects table names that are not plain identifiers", () => {
    const db = new DatabaseSync(":memory:");
    expect(() => new SqliteStore(db, { tableName: 'approvals"; DROP TABLE x' })).toThrow(
      /invalid table name/i,
    );
  });

  it("round-trips nested field definitions through JSON", async () => {
    const store = new SqliteStore(new DatabaseSync(":memory:"));
    const fields = {
      subject: field.textField({ label: "Subject", default: "Hello" }),
      tier: field.select({ label: "Tier", options: ["gold", "silver"], default: "silver" }),
      confirmed: field.confirm({ label: "Confirm?" }),
    };
    await store.create({ ...newRecord("a1"), fields });

    expect((await store.get("a1"))?.fields).toEqual(fields);
  });

  it("exports idempotent schemaSql", () => {
    expect(schemaSql("hitldev.approvals")).toContain(
      'CREATE TABLE IF NOT EXISTS "hitldev.approvals"',
    );
    expect(schemaSql("custom_approvals")).toContain("CREATE TABLE IF NOT EXISTS custom_approvals");
  });
});
