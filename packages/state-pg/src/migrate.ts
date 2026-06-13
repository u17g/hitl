import { MIGRATIONS } from "./migrations/index.js";
import type { PgQueryable } from "./migrations/types.js";
import { createMigrationContext } from "./schema-sql.js";
import { metaTableSql, resolveTableName } from "./table.js";

export type { PgQueryable } from "./migrations/types.js";

function metaBootstrapSql(tableName: string): string {
  const table = resolveTableName(tableName);
  const meta = metaTableSql(table);
  const schemaDdl = table.schema ? `CREATE SCHEMA IF NOT EXISTS ${table.schema};\n` : "";
  return `
    ${schemaDdl}CREATE TABLE IF NOT EXISTS ${meta} (
      id          TEXT PRIMARY KEY,
      applied_at  TEXT NOT NULL
    );
  `.trim();
}

async function getAppliedMigrationIds(pool: PgQueryable, tableName: string): Promise<Set<string>> {
  const table = resolveTableName(tableName);
  const meta = metaTableSql(table);
  try {
    const { rows } = await pool.query(`SELECT id FROM ${meta}`);
    return new Set(rows.map((row) => String((row as { id: string }).id)));
  } catch {
    return new Set();
  }
}

/** Apply pending migrations and record them in the internal ledger table. */
export async function applyMigrations(pool: PgQueryable, tableName: string): Promise<void> {
  await ensureMetaTable(pool, tableName);

  const ctx = createMigrationContext(tableName);
  const applied = await getAppliedMigrationIds(pool, tableName);
  const meta = metaTableSql(ctx.table);

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.id)) continue;
    if (migration.runPg) {
      await migration.runPg(pool, ctx);
    } else {
      await pool.query(migration.sql(ctx));
    }
    await pool.query(`INSERT INTO ${meta} (id, applied_at) VALUES ($1, $2)`, [
      migration.id,
      new Date().toISOString(),
    ]);
  }
}

async function ensureMetaTable(pool: PgQueryable, tableName: string): Promise<void> {
  const table = resolveTableName(tableName);
  const meta = metaTableSql(table);
  try {
    await pool.query(`SELECT 1 FROM ${meta} LIMIT 0`);
    return;
  } catch {
    // Meta table missing — apply bootstrap DDL below.
  }
  await pool.query(metaBootstrapSql(tableName));
}
