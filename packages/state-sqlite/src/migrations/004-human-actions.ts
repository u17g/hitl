import type { Migration } from "./types.js";

/** Human actions, context, and timeline table. */
export const migration004HumanActions: Migration = {
  id: "004_human_actions",
  sql(ctx) {
    return `
      ALTER TABLE ${ctx.table.sql} ADD COLUMN actions TEXT;
      ALTER TABLE ${ctx.table.sql} ADD COLUMN context TEXT;
      UPDATE ${ctx.table.sql}
        SET actions = json_object('submit', json_object('fields', json(fields)))
        WHERE actions IS NULL;
      ALTER TABLE ${ctx.table.batchesSql} ADD COLUMN actions TEXT;
      ALTER TABLE ${ctx.table.batchesSql} ADD COLUMN context TEXT;
      CREATE TABLE IF NOT EXISTS ${ctx.table.timelineSql} (
        id         TEXT PRIMARY KEY,
        thread_id  TEXT NOT NULL,
        message    TEXT NOT NULL,
        detail     TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS ${ctx.table.timelineThreadIndexName}
        ON ${ctx.table.timelineSql} (thread_id);
    `.trim();
  },
};
