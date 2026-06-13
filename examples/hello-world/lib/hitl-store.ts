import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { Store } from "hitl";
import { SqliteStore } from "@hitldev/store-sqlite";

const dbDir = join(process.cwd(), ".hitldev");
const dbPath = join(dbDir, "approvals.db");
mkdirSync(dbDir, { recursive: true });

let store: Store | undefined;

export function getStore(): Store {
  store ??= new SqliteStore(new DatabaseSync(dbPath));
  return store;
}
