import { describe, expect, it } from "vitest";
import { renderSchemaSql, resolveSchemaTable } from "./schema-cli.js";

describe("schema command", () => {
  it("prints postgres DDL", () => {
    const sql = renderSchemaSql("hitl.human_requests");
    expect(sql).toContain("CREATE SCHEMA IF NOT EXISTS hitl");
    expect(sql).toContain("JSONB NOT NULL");
  });

  it("parses table flag", () => {
    expect(resolveSchemaTable(["--table", "custom_approvals"])).toBe("custom_approvals");
  });
});
