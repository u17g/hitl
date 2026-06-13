import pg from "pg";
import { PostgresState, type PgQueryable } from "./index.js";
import { parseFlagValue } from "./args.js";
import { getDatabaseUrl } from "./db-url.js";
import { DEFAULT_TABLE } from "./table.js";

export async function ensureHitlSchema(
  pool: PgQueryable,
  tableName = DEFAULT_TABLE,
): Promise<void> {
  const state = new PostgresState(pool, { tableName });
  await state.ensureSchema();
}

/** Create the hitl approvals table in Postgres. */
export async function runSetup(args: string[]): Promise<void> {
  const table = parseFlagValue(args, "--table") ?? DEFAULT_TABLE;
  const connectionString = getDatabaseUrl();

  const pool = new pg.Pool({ connectionString });
  try {
    await ensureHitlSchema(pool, table);
    console.log(`state-pg: ensured schema for ${table}`);
  } finally {
    await pool.end();
  }
}
