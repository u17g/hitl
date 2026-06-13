import type { PgQueryable } from "./types.js";
import type { Migration } from "./types.js";

const LEGACY_DEFAULT = "hitl.approvals";
const NEW_DEFAULT = "hitl.human_requests";

async function pgTableExists(pool: PgQueryable, schema: string, table: string): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2`,
    [schema, table],
  );
  return rows.length > 0;
}

/** Rename legacy default `hitl.approvals*` tables when upgrading to `hitl.human_requests*`. */
export const migration006RenameHumanRequests: Migration = {
  id: "006_rename_human_requests",
  sql() {
    return "SELECT 1";
  },
  async runPg(pool, ctx) {
    if (ctx.tableName !== NEW_DEFAULT) return;
    if (!(await pgTableExists(pool, "hitl", "approvals"))) return;
    if (await pgTableExists(pool, "hitl", "human_requests")) return;

    await pool.query(`ALTER TABLE ${LEGACY_DEFAULT} RENAME TO human_requests`);

    if (
      (await pgTableExists(pool, "hitl", "approvals_batches")) &&
      !(await pgTableExists(pool, "hitl", "human_requests_batches"))
    ) {
      await pool.query(`ALTER TABLE ${LEGACY_DEFAULT}_batches RENAME TO human_requests_batches`);
    }

    if (
      (await pgTableExists(pool, "hitl", "approvals_timeline")) &&
      !(await pgTableExists(pool, "hitl", "human_requests_timeline"))
    ) {
      await pool.query(`ALTER TABLE ${LEGACY_DEFAULT}_timeline RENAME TO human_requests_timeline`);
    }
  },
};
