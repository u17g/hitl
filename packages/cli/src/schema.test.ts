import { describe, expect, it } from "vitest";
import { renderSchemaSql, resolveSchemaDialect, resolveSchemaTable } from "./schema";

describe("schema command", () => {
  it("defaults to postgres DDL", () => {
    const sql = renderSchemaSql("hitldev.approvals", "postgres");
    expect(sql).toContain("CREATE SCHEMA IF NOT EXISTS hitldev");
    expect(sql).toContain("JSONB NOT NULL");
  });

  it("supports sqlite DDL", () => {
    const sql = renderSchemaSql("hitldev.approvals", "sqlite");
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "hitldev.approvals"');
    expect(sql).toContain("fields      TEXT NOT NULL");
  });

  it("parses table and dialect flags", () => {
    expect(resolveSchemaTable(["--table", "custom_approvals"])).toBe("custom_approvals");
    expect(resolveSchemaDialect(["--dialect", "sqlite"])).toBe("sqlite");
  });

  it("rejects unknown dialects", () => {
    expect(() => resolveSchemaDialect(["--dialect", "mysql"])).toThrow(/unknown dialect/i);
  });
});
