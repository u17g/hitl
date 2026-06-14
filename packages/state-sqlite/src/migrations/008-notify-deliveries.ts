import type { Migration } from "./types.js";

/** Notify delivery records for timeline anchor chains (notify → waitForHuman). */
export const migration008NotifyDeliveries: Migration = {
  id: "008_notify_deliveries",
  sql(ctx) {
    return `
      CREATE TABLE IF NOT EXISTS ${ctx.table.notifyDeliveriesSql} (
        id          TEXT PRIMARY KEY,
        channel     TEXT NOT NULL,
        message     TEXT NOT NULL,
        group_id    TEXT NOT NULL,
        external_id TEXT,
        created_at  TEXT NOT NULL
      );
    `.trim();
  },
};
