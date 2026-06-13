import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { applyMigrations } from "./migrate";
import { MIGRATIONS, SCHEMA_VERSION } from "./migrations/index";
import { migrationSql, schemaSql } from "./schema-sql";
import { DEFAULT_TABLE } from "./table";

describe("sqlite migrations", () => {
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
    ]);
  });

  it("prints user-facing DDL without the migration ledger", () => {
    expect(schemaSql(DEFAULT_TABLE)).toContain('CREATE TABLE IF NOT EXISTS "hitl.human_requests"');
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
      .prepare('SELECT id FROM "hitl.schema_migrations" ORDER BY id')
      .all() as Array<{ id: string }>;
    expect(rows.map((row) => row.id)).toEqual([
      "001_initial",
      "002_external_ids",
      "003_batches",
      "004_human_actions",
      "005_actions_array",
      "006_rename_human_requests",
      "007_rename_batch_title_to_message",
    ]);
  });

  it("upgrades a v2 database in place", () => {
    const db = new DatabaseSync(":memory:");
    db.exec(migrationSql("001_initial", DEFAULT_TABLE));
    db.exec(migrationSql("002_external_ids", DEFAULT_TABLE));
    db.exec(`
      CREATE TABLE "hitl.schema_migrations" (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL);
      INSERT INTO "hitl.schema_migrations" VALUES ('001_initial', 'x'), ('002_external_ids', 'x');
    `);

    applyMigrations(db, DEFAULT_TABLE);

    // batch columns and the batches table now exist
    db.prepare('SELECT batch_id, batch_index FROM "hitl.human_requests" LIMIT 0').get();
    db.prepare('SELECT id, channel, message FROM "hitl.human_requests_batches" LIMIT 0').get();
  });

  it("renames legacy default tables on upgrade", () => {
    const legacyTable = "hitl.approvals";
    const db = new DatabaseSync(":memory:");
    for (const id of [
      "001_initial",
      "002_external_ids",
      "003_batches",
      "004_human_actions",
      "005_actions_array",
    ]) {
      db.exec(migrationSql(id, legacyTable));
    }
    db.exec(`
      CREATE TABLE "hitl.schema_migrations" (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL);
      INSERT INTO "hitl.schema_migrations" VALUES
        ('001_initial', 'x'),
        ('002_external_ids', 'x'),
        ('003_batches', 'x'),
        ('004_human_actions', 'x'),
        ('005_actions_array', 'x');
    `);

    applyMigrations(db, DEFAULT_TABLE);

    db.prepare('SELECT 1 FROM "hitl.human_requests" LIMIT 0').get();
    db.prepare('SELECT 1 FROM "hitl.human_requests_batches" LIMIT 0').get();
    expect(() => db.prepare('SELECT 1 FROM "hitl.approvals" LIMIT 0').get()).toThrow();
  });
});
