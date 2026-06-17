import type { ResolvedKeyPrefix } from "../keys.js";

export interface RedisMigrationContext {
  prefix: string;
  keys: ResolvedKeyPrefix;
}

export interface Migration {
  id: string;
  runRedis?(redis: RedisMigrator, ctx: RedisMigrationContext): Promise<void>;
}

/** Minimal Redis surface used by migrations and state. */
export interface RedisMigrator {
  sadd(key: string, ...members: string[]): Promise<number>;
  smembers(key: string): Promise<string[]>;
  type(key: string): Promise<string>;
  get(key: string): Promise<string | null>;
  del(...keys: string[]): Promise<number>;
  zadd(key: string, score: number, member: string): Promise<number | string>;
  zrange(key: string, start: number, stop: number, withScores: "WITHSCORES"): Promise<string[]>;
}
