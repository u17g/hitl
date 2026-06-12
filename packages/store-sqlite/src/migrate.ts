import type { DatabaseSync } from "node:sqlite";
import { MIGRATIONS } from "./migrations/index.js";
import { createMigrationContext } from "./schema-sql.js";
import { metaTableSql, resolveTableName } from "./table.js";

function metaBootstrapSql(tableName: string): string {
  const table = resolveTableName(tableName);
  const meta = metaTableSql(table);
  return `
    CREATE TABLE IF NOT EXISTS ${meta} (
      id          TEXT PRIMARY KEY,
      applied_at  TEXT NOT NULL
    );
  `.trim();
}

function getAppliedMigrationIds(db: DatabaseSync, tableName: string): Set<string> {
  const table = resolveTableName(tableName);
  const meta = metaTableSql(table);
  try {
    const rows = db.prepare(`SELECT id FROM ${meta}`).all() as Array<{ id: string }>;
    return new Set(rows.map((row) => row.id));
  } catch {
    return new Set();
  }
}

/** Apply pending migrations and record them in the internal ledger table. */
export function applyMigrations(db: DatabaseSync, tableName: string): void {
  ensureMetaTable(db, tableName);

  const ctx = createMigrationContext(tableName);
  const applied = getAppliedMigrationIds(db, tableName);
  const meta = metaTableSql(ctx.table);
  const insert = db.prepare(`INSERT INTO ${meta} (id, applied_at) VALUES (?, ?)`);

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.id)) continue;
    db.exec(migration.sql(ctx));
    insert.run(migration.id, new Date().toISOString());
  }
}

function ensureMetaTable(db: DatabaseSync, tableName: string): void {
  const table = resolveTableName(tableName);
  const meta = metaTableSql(table);
  try {
    db.prepare(`SELECT 1 FROM ${meta} LIMIT 0`).get();
    return;
  } catch {
    // Meta table missing — apply bootstrap DDL below.
  }
  db.exec(metaBootstrapSql(tableName));
}
