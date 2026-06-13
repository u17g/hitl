import { schemaSql } from "./index.js";
import { parseFlagValue } from "./args.js";
import { DEFAULT_TABLE } from "./table.js";

export function resolveSchemaTable(args: string[]): string {
  return parseFlagValue(args, "--table") ?? DEFAULT_TABLE;
}

export function renderSchemaSql(table: string): string {
  const sql = schemaSql(table);
  return sql.endsWith("\n") ? sql : `${sql}\n`;
}

/** Print idempotent DDL for the approvals table. */
export function runSchema(args: string[]): void {
  const table = resolveSchemaTable(args);
  process.stdout.write(renderSchemaSql(table));
}
