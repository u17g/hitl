import type { ResolvedTable } from "../table.js";

export interface MigrationContext {
  tableName: string;
  table: ResolvedTable;
}

export interface Migration {
  readonly id: string;
  sql(ctx: MigrationContext): string;
}
