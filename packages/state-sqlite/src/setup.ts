import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { SqliteState } from "./index.js";
import { parseFlagValue } from "./args.js";
import { DEFAULT_TABLE } from "./table.js";

/** Create the hitl approvals schema in a SQLite database file. */
export function runSetup(args: string[]): void {
  const dbPath = parseFlagValue(args, "--db");
  if (!dbPath) {
    throw new Error("--db is required (path to the SQLite database file)");
  }

  const table = parseFlagValue(args, "--table") ?? DEFAULT_TABLE;
  mkdirSync(dirname(dbPath), { recursive: true });

  const db = new DatabaseSync(dbPath);
  try {
    new SqliteState(db, { tableName: table });
    console.log(`state-sqlite: ensured schema for ${table} in ${dbPath}`);
  } finally {
    db.close();
  }
}
