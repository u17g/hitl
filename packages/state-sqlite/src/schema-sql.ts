import { MIGRATIONS } from "./migrations/index.js";
import { DEFAULT_TABLE, resolveTableName } from "./table.js";

export function createMigrationContext(tableName: string) {
  return {
    tableName,
    table: resolveTableName(tableName),
  };
}

/** User-facing DDL for all migrations (excludes the internal migration ledger). */
export function schemaSql(tableName = DEFAULT_TABLE): string {
  const ctx = createMigrationContext(tableName);
  const statements = MIGRATIONS.map((migration) => migration.sql(ctx));
  return `${statements.join("\n\n")}\n`;
}

/** DDL for a single migration, useful for hand-managed migration pipelines. */
export function migrationSql(migrationId: string, tableName = DEFAULT_TABLE): string {
  const migration = MIGRATIONS.find((entry) => entry.id === migrationId);
  if (!migration) {
    throw new Error(`Unknown migration "${migrationId}"`);
  }
  return `${migration.sql(createMigrationContext(tableName)).trim()}\n`;
}
