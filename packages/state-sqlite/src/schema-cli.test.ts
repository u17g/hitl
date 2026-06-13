import { describe, expect, it } from "vitest";
import { renderSchemaSql, resolveSchemaTable } from "./schema-cli.js";

describe("schema command", () => {
  it("prints sqlite DDL", () => {
    const sql = renderSchemaSql("hitl.human_requests");
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "hitl.human_requests"');
    expect(sql).toContain("fields      TEXT NOT NULL");
  });

  it("parses table flag", () => {
    expect(resolveSchemaTable(["--table", "custom_approvals"])).toBe("custom_approvals");
  });
});
