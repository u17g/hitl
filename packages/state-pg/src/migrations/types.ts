import type { ResolvedTable } from "../table.js";

export interface PgQueryable {
  query(text: string, values?: unknown[]): Promise<{ rows: unknown[]; rowCount: number | null }>;
}

export interface MigrationContext {
  tableName: string;
  table: ResolvedTable;
}

export interface Migration {
  readonly id: string;
  sql(ctx: MigrationContext): string;
  runPg?(pool: PgQueryable, ctx: MigrationContext): Promise<void>;
}
