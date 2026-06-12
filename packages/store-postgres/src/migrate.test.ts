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
    expect(MIGRATIONS.map((migration) => migration.id)).toEqual(["001_initial", "002_external_ids"]);
  });

  it("prints user-facing DDL without the migration ledger", () => {
    expect(schemaSql(DEFAULT_TABLE)).toContain("CREATE SCHEMA IF NOT EXISTS hitldev");
    expect(schemaSql(DEFAULT_TABLE)).not.toContain("schema_migrations");
  });

  it("supports per-migration DDL export", () => {
    expect(migrationSql("001_initial", DEFAULT_TABLE)).toContain("JSONB NOT NULL");
  });

  it("is idempotent and records applied migrations", async () => {
    const pool = newPool();
    await applyMigrations(pool, DEFAULT_TABLE);
    await applyMigrations(pool, DEFAULT_TABLE);

    const { rows } = await pool.query("SELECT id FROM hitldev.schema_migrations ORDER BY id");
    expect(rows.map((row) => row.id)).toEqual(["001_initial", "002_external_ids"]);
  });
});
