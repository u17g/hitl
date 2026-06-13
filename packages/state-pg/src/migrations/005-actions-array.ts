import type { Migration } from "./types.js";

/**
 * Version marker for actions-array storage format.
 * Legacy object-shaped rows are normalized at read time via `normalizeActions()`.
 * Fresh installs store arrays from the start.
 */
export const migration005ActionsArray: Migration = {
  id: "005_actions_array",
  sql() {
    return "SELECT 1";
  },
};
