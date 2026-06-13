import type { Migration } from "./types.js";

/** Initial approvals table and external_id index. */
export const migration001Initial: Migration = {
  id: "001_initial",
  sql(ctx) {
    return `
      CREATE TABLE IF NOT EXISTS ${ctx.table.sql} (
        id          TEXT PRIMARY KEY,
        token       TEXT NOT NULL,
        channel     TEXT NOT NULL,
        message     TEXT NOT NULL,
        fields      TEXT NOT NULL,
        status      TEXT NOT NULL,
        external_id TEXT,
        result      TEXT,
        created_at  TEXT NOT NULL,
        resolved_at TEXT
      );
      CREATE INDEX IF NOT EXISTS ${ctx.table.indexName}
        ON ${ctx.table.sql} (external_id);
    `.trim();
  },
};
