import type { Migration } from "./types.js";

/** Declares key layout v1; no data rewrite required on first install. */
export const migration001Initial: Migration = {
  id: "001-initial",
  async runRedis(_redis, _ctx) {
    // Key layout v1 is applied lazily on writes; nothing to migrate yet.
  },
};
