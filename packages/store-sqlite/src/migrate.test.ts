import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { applyMigrations } from "./migrate";
import { MIGRATIONS, SCHEMA_VERSION } from "./migrations/index";
import { migrationSql, schemaSql } from "./schema-sql";
import { DEFAULT_TABLE } from "./table";

describe("sqlite migrations", () => {
  it("tracks the current schema version", () => {
    expect(SCHEMA_VERSION).toBe(MIGRATIONS.length);
    expect(MIGRATIONS.map((migration) => migration.id)).toEqual(["001_initial", "002_external_ids"]);
  });

  it("prints user-facing DDL without the migration ledger", () => {
    expect(schemaSql(DEFAULT_TABLE)).toContain('CREATE TABLE IF NOT EXISTS "hitldev.approvals"');
    expect(schemaSql(DEFAULT_TABLE)).not.toContain("schema_migrations");
  });

  it("supports per-migration DDL export", () => {
    expect(migrationSql("001_initial", DEFAULT_TABLE)).toContain("fields      TEXT NOT NULL");
  });

  it("is idempotent and records applied migrations", () => {
    const db = new DatabaseSync(":memory:");
    applyMigrations(db, DEFAULT_TABLE);
    applyMigrations(db, DEFAULT_TABLE);

    const rows = db
      .prepare('SELECT id FROM "hitldev.schema_migrations" ORDER BY id')
      .all() as Array<{ id: string }>;
    expect(rows.map((row) => row.id)).toEqual(["001_initial", "002_external_ids"]);
  });
});
