import type { Migration } from "./types.js";

/** Keyset paging indexes for `list`, newest-first over `(created_at, id)`. */
export const migration009InboxIndex: Migration = {
  id: "009_inbox_index",
  sql(ctx) {
    return `
      CREATE INDEX IF NOT EXISTS ${ctx.table.listStatusIndexName}
        ON ${ctx.table.sql} (status, created_at DESC, id DESC);
      CREATE INDEX IF NOT EXISTS ${ctx.table.listCreatedIndexName}
        ON ${ctx.table.sql} (created_at DESC, id DESC);
    `.trim();
  },
};
