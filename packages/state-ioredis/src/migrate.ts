import type Redis from "ioredis";
import { DEFAULT_TABLE, resolveKeyPrefix } from "./keys.js";
import { MIGRATIONS } from "./migrations/index.js";
import type { RedisMigrationContext } from "./migrations/types.js";

function createMigrationContext(tableName: string): RedisMigrationContext {
  const keys = resolveKeyPrefix(tableName);
  return { prefix: keys.prefix, keys };
}

async function getAppliedMigrationIds(redis: Redis, tableName: string): Promise<Set<string>> {
  const { keys } = createMigrationContext(tableName);
  const applied = await redis.smembers(keys.metaMigrations());
  return new Set(applied);
}

/** Apply pending migrations and record them in the internal ledger set. */
export async function applyMigrations(
  redis: Redis,
  tableName = DEFAULT_TABLE,
): Promise<void> {
  const ctx = createMigrationContext(tableName);
  const applied = await getAppliedMigrationIds(redis, tableName);

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.id)) continue;
    if (migration.runRedis) {
      await migration.runRedis(redis, ctx);
    }
    await redis.sadd(ctx.keys.metaMigrations(), migration.id);
  }
}
