import { schemaSql as postgresSchemaSql } from "@hitl/state-pg";
import { schemaSql as sqliteSchemaSql } from "@hitl/state-sqlite";
import { parseFlagValue } from "./args.js";

const DEFAULT_TABLE = "hitldev.approvals";

export type SchemaDialect = "postgres" | "sqlite";

export function resolveSchemaDialect(args: string[]): SchemaDialect {
  const dialect = parseFlagValue(args, "--dialect") ?? "postgres";
  if (dialect !== "postgres" && dialect !== "sqlite") {
    throw new Error(`Unknown dialect "${dialect}" (expected postgres or sqlite)`);
  }
  return dialect;
}

export function resolveSchemaTable(args: string[]): string {
  return parseFlagValue(args, "--table") ?? DEFAULT_TABLE;
}

export function renderSchemaSql(table: string, dialect: SchemaDialect): string {
  const sql = dialect === "postgres" ? postgresSchemaSql(table) : sqliteSchemaSql(table);
  return sql.endsWith("\n") ? sql : `${sql}\n`;
}

/** Print idempotent DDL for the approvals table. */
export function runSchema(args: string[]): void {
  const table = resolveSchemaTable(args);
  const dialect = resolveSchemaDialect(args);
  process.stdout.write(renderSchemaSql(table, dialect));
}
