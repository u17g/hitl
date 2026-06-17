import { describe, expect, it } from "vitest";
import { newDb } from "pg-mem";
import { applyMigrations, type PgQueryable } from "./migrate";
import { MIGRATIONS, SCHEMA_VERSION } from "./migrations/index";
import { migrationSql, schemaSql } from "./schema-sql";
import { DEFAULT_TABLE } from "./table";

function newPool(): PgQueryable {
  const { Pool } = newDb().adapters.createPg();
  return new Pool();
}

describe("postgres migrations", () => {
  it("tracks the current schema version", () => {
    expect(SCHEMA_VERSION).toBe(MIGRATIONS.length);
    expect(MIGRATIONS.map((migration) => migration.id)).toEqual([
      "001_initial",
      "002_external_ids",
      "003_batches",
      "004_human_actions",
      "005_actions_array",
      "006_rename_human_requests",
      "007_rename_batch_title_to_message",
      "008_notify_deliveries",
      "009_inbox_index",
    ]);
  });

  it("prints user-facing DDL without the migration ledger", () => {
    expect(schemaSql(DEFAULT_TABLE)).toContain("CREATE SCHEMA IF NOT EXISTS hitl");
    expect(schemaSql(DEFAULT_TABLE)).not.toContain("schema_migrations");
  });

  it("supports per-migration DDL export", () => {
    expect(migrationSql("001_initial", DEFAULT_TABLE)).toContain("JSONB NOT NULL");
  });

  it("is idempotent and records applied migrations", async () => {
    const pool = newPool();
    await applyMigrations(pool, DEFAULT_TABLE);
    await applyMigrations(pool, DEFAULT_TABLE);

    const { rows } = await pool.query("SELECT id FROM hitl.schema_migrations ORDER BY id");
    expect(rows.map((row) => (row as { id: string }).id)).toEqual([
      "001_initial",
      "002_external_ids",
      "003_batches",
      "004_human_actions",
      "005_actions_array",
      "006_rename_human_requests",
      "007_rename_batch_title_to_message",
      "008_notify_deliveries",
      "009_inbox_index",
    ]);
  });

  it("upgrades a v2 database in place", async () => {
    const pool = newPool();
    await pool.query("CREATE SCHEMA IF NOT EXISTS hitl");
    await pool.query(migrationSql("001_initial", DEFAULT_TABLE));
    await pool.query(migrationSql("002_external_ids", DEFAULT_TABLE));
    await pool.query(
      "CREATE TABLE hitl.schema_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)",
    );
    await pool.query(
      "INSERT INTO hitl.schema_migrations VALUES ('001_initial', 'x'), ('002_external_ids', 'x')",
    );

    await applyMigrations(pool, DEFAULT_TABLE);

    // batch columns and the batches table now exist
    await pool.query("SELECT batch_id, batch_index FROM hitl.human_requests LIMIT 0");
    await pool.query("SELECT id, channel, message FROM hitl.human_requests_batches LIMIT 0");
  });
});
