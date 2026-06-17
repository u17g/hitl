import type { Migration } from "./types.js";

/**
 * Backfill the per-namespace indexes for existing records. Fresh installs have
 * nothing in the status ZSETs yet — `create` already writes the namespace
 * indexes — so this only seeds legacy deployments (defaulting to `global`).
 */
export const migration003NamespaceIndexes: Migration = {
  id: "003-namespace-indexes",
  async runRedis(redis, ctx) {
    const { keys } = ctx;
    for (const status of ["pending", "resolved"] as const) {
      const entries = await redis.zrange(keys.idxStatus(status), 0, -1, "WITHSCORES");
      for (let i = 0; i < entries.length; i += 2) {
        const id = entries[i]!;
        const score = Number(entries[i + 1]!);
        const raw = await redis.get(keys.req(id));
        const namespace = raw
          ? ((JSON.parse(raw).namespace as string | undefined) ?? "global")
          : "global";
        await redis.zadd(keys.idxNs(namespace), score, id);
        await redis.zadd(keys.idxNsStatus(namespace, status), score, id);
      }
    }
  },
};
