import type { Migration } from "./types.js";

/** Rename batch envelope column from title to message (aligns with waitForHuman API). */
export const migration007RenameBatchTitleToMessage: Migration = {
  id: "007_rename_batch_title_to_message",
  sql(ctx) {
    return `
      ALTER TABLE ${ctx.table.batchesSql}
        RENAME COLUMN title TO message;
    `.trim();
  },
};
