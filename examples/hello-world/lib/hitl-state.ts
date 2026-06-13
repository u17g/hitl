import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { State } from "hitl/state";
import { SqliteState } from "@hitl/state-sqlite";

const dbDir = join(process.cwd(), ".hitl");
const dbPath =
  process.env.NEXT_PHASE === "phase-production-build"
    ? ":memory:"
    : join(dbDir, "human_requests.db");

if (dbPath !== ":memory:") {
  mkdirSync(dbDir, { recursive: true });
}

const globalForHitl = globalThis as typeof globalThis & { __hitlState?: State };

export function getState(): State {
  if (!globalForHitl.__hitlState) {
    const db = new DatabaseSync(dbPath);
    db.exec("PRAGMA busy_timeout = 5000");
    globalForHitl.__hitlState = new SqliteState(db);
  }
  return globalForHitl.__hitlState;
}
