import type { Migration } from "./types.js";

/** Per-adapter external ids for escalation re-deliveries. */
export const migration002ExternalIds: Migration = {
  id: "002_external_ids",
  sql(ctx) {
    return `
      ALTER TABLE ${ctx.table.sql}
        ADD COLUMN external_ids TEXT NOT NULL DEFAULT '{}';
    `.trim();
  },
};
