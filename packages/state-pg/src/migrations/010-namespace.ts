import type { Migration } from "./types.js";

/** Logical inbox partition; existing rows default to `global`. Namespace-scoped paging indexes. */
export const migration010Namespace: Migration = {
  id: "010_namespace",
  sql(ctx) {
    return `
      ALTER TABLE ${ctx.table.sql}
        ADD COLUMN IF NOT EXISTS namespace TEXT NOT NULL DEFAULT 'global';
      CREATE INDEX IF NOT EXISTS ${ctx.table.listNsStatusIndexName}
        ON ${ctx.table.sql} (namespace, status, created_at DESC, id DESC);
      CREATE INDEX IF NOT EXISTS ${ctx.table.listNsIndexName}
        ON ${ctx.table.sql} (namespace, created_at DESC, id DESC);
    `.trim();
  },
};
