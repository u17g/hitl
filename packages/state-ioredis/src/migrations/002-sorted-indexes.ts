import type { Migration } from "./types.js";

/**
 * Convert the status and all-request indexes from plain SETs to ZSETs scored by
 * `createdAt` (ms), so `list` can page newest-first. Fresh installs have no SET
 * data — `create` already writes ZSETs — so this only rewrites legacy deployments.
 */
export const migration002SortedIndexes: Migration = {
  id: "002-sorted-indexes",
  async runRedis(redis, ctx) {
    const { keys } = ctx;
    const indexKeys = [
      keys.idxStatus("pending"),
      keys.idxStatus("resolved"),
      keys.idxAllReq(),
    ];

    for (const key of indexKeys) {
      // Only legacy SETs need rewriting; missing/zset keys are left untouched.
      if ((await redis.type(key)) !== "set") continue;

      const ids = await redis.smembers(key);
      const scored: Array<[number, string]> = [];
      for (const id of ids) {
        const raw = await redis.get(keys.req(id));
        const createdAt = raw ? (JSON.parse(raw).createdAt as string | undefined) : undefined;
        scored.push([createdAt ? Date.parse(createdAt) : 0, id]);
      }

      await redis.del(key);
      for (const [score, id] of scored) {
        await redis.zadd(key, score, id);
      }
    }
  },
};
