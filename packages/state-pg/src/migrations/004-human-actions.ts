import type { Migration } from "./types.js";

/** Human actions, context, and timeline table. */
export const migration004HumanActions: Migration = {
  id: "004_human_actions",
  sql(ctx) {
    return `
      ALTER TABLE ${ctx.table.sql} ADD COLUMN IF NOT EXISTS actions JSONB;
      ALTER TABLE ${ctx.table.sql} ADD COLUMN IF NOT EXISTS context JSONB;
      UPDATE ${ctx.table.sql}
        SET actions = ('{"submit":{"fields":' || fields::text || '}}')::jsonb
        WHERE actions IS NULL;
      ALTER TABLE ${ctx.table.batchesSql} ADD COLUMN IF NOT EXISTS actions JSONB;
      ALTER TABLE ${ctx.table.batchesSql} ADD COLUMN IF NOT EXISTS context JSONB;
      CREATE TABLE IF NOT EXISTS ${ctx.table.timelineSql} (
        id         TEXT PRIMARY KEY,
        thread_id  TEXT NOT NULL,
        message    TEXT NOT NULL,
        detail     JSONB,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS ${ctx.table.timelineThreadIndexName}
        ON ${ctx.table.timelineSql} (thread_id);
    `.trim();
  },
};
