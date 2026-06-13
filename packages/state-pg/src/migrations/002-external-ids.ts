import type { Migration } from "./types.js";

/** Per-adapter external ids for escalation re-deliveries. */
export const migration002ExternalIds: Migration = {
  id: "002_external_ids",
  sql(ctx) {
    return `
      ALTER TABLE ${ctx.table.sql}
        ADD COLUMN IF NOT EXISTS external_ids JSONB NOT NULL DEFAULT '{}'::jsonb;
    `.trim();
  },
};
