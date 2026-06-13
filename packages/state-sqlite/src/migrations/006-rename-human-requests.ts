import type { DatabaseSync } from "node:sqlite";
import type { Migration } from "./types.js";

const LEGACY_DEFAULT = "hitl.approvals";
const NEW_DEFAULT = "hitl.human_requests";

function sqliteTableExists(db: DatabaseSync, name: string): boolean {
  const row = db
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(name);
  return row !== undefined;
}

function renameSqliteTable(db: DatabaseSync, from: string, to: string): void {
  db.exec(`ALTER TABLE "${from}" RENAME TO "${to}"`);
}

/** Rename legacy default `hitl.approvals*` tables when upgrading to `hitl.human_requests*`. */
export const migration006RenameHumanRequests: Migration = {
  id: "006_rename_human_requests",
  sql() {
    return "SELECT 1";
  },
  runSqlite(db, ctx) {
    if (ctx.tableName !== NEW_DEFAULT) return;
    if (!sqliteTableExists(db, LEGACY_DEFAULT)) return;
    if (sqliteTableExists(db, NEW_DEFAULT)) return;

    renameSqliteTable(db, LEGACY_DEFAULT, NEW_DEFAULT);

    const legacyBatches = `${LEGACY_DEFAULT}_batches`;
    const newBatches = `${NEW_DEFAULT}_batches`;
    if (sqliteTableExists(db, legacyBatches) && !sqliteTableExists(db, newBatches)) {
      renameSqliteTable(db, legacyBatches, newBatches);
    }

    const legacyTimeline = `${LEGACY_DEFAULT}_timeline`;
    const newTimeline = `${NEW_DEFAULT}_timeline`;
    if (sqliteTableExists(db, legacyTimeline) && !sqliteTableExists(db, newTimeline)) {
      renameSqliteTable(db, legacyTimeline, newTimeline);
    }
  },
};
