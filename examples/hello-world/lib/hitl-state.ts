import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { State } from "hitl";
import { SqliteState } from "@hitl/state-sqlite";

const dbDir = join(process.cwd(), ".hitl");
const dbPath = join(dbDir, "approvals.db");
mkdirSync(dbDir, { recursive: true });

let state: State | undefined;

export function getState(): State {
  state ??= new SqliteState(new DatabaseSync(dbPath));
  return state;
}
