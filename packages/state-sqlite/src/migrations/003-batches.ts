import type { Migration } from "./types.js";

/** Batch grouping: batch columns on approvals plus the companion batches table. */
export const migration003Batches: Migration = {
  id: "003_batches",
  sql(ctx) {
    return `
      ALTER TABLE ${ctx.table.sql} ADD COLUMN batch_id TEXT;
      ALTER TABLE ${ctx.table.sql} ADD COLUMN batch_index INTEGER;
      CREATE INDEX IF NOT EXISTS ${ctx.table.batchIdIndexName}
        ON ${ctx.table.sql} (batch_id);
      CREATE TABLE IF NOT EXISTS ${ctx.table.batchesSql} (
        id           TEXT PRIMARY KEY,
        channel      TEXT NOT NULL,
        title        TEXT,
        external_id  TEXT,
        external_ids TEXT NOT NULL DEFAULT '{}',
        created_at   TEXT NOT NULL
      );
    `.trim();
  },
};
