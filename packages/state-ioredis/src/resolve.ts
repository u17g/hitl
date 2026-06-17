import type Redis from "ioredis";
import type { HumanResult } from "@hitl-sdk/hitl";
import type { ResolvedKeyPrefix } from "./keys.js";
import { parseHumanRequest, type StoredHumanRequest } from "./serialize.js";

const RESOLVE_LUA = `
local reqKey = KEYS[1]
local pendingKey = KEYS[2]
local resolvedKey = KEYS[3]
local resultJson = ARGV[1]
local resolvedAt = ARGV[2]
local id = ARGV[3]
local prefix = ARGV[4]

local raw = redis.call('GET', reqKey)
if not raw then return 'missing' end

local record = cjson.decode(raw)
if record.status ~= 'pending' then return 'resolved' end

record.status = 'resolved'
record.result = cjson.decode(resultJson)
record.resolvedAt = resolvedAt

local score = redis.call('ZSCORE', pendingKey, id)
if not score then score = 0 end

local ns = record.namespace or 'global'
local nsPending = prefix .. ':idx:ns:' .. ns .. ':status:pending'
local nsResolved = prefix .. ':idx:ns:' .. ns .. ':status:resolved'

redis.call('SET', reqKey, cjson.encode(record))
redis.call('ZREM', pendingKey, id)
redis.call('ZADD', resolvedKey, score, id)
redis.call('ZREM', nsPending, id)
redis.call('ZADD', nsResolved, score, id)
return 'ok'
`;

export type ResolveOutcome = "ok" | "missing" | "resolved";

export async function resolveAtomic(
  redis: Redis,
  keys: ResolvedKeyPrefix,
  id: string,
  result: HumanResult,
): Promise<ResolveOutcome> {
  const reqKey = keys.req(id);
  const pendingKey = keys.idxStatus("pending");
  const resolvedKey = keys.idxStatus("resolved");
  const resolvedAt = new Date().toISOString();
  const resultJson = JSON.stringify(result);

  try {
    const outcome = await redis.eval(
      RESOLVE_LUA,
      3,
      reqKey,
      pendingKey,
      resolvedKey,
      resultJson,
      resolvedAt,
      id,
      keys.prefix,
    );
    if (outcome === "ok" || outcome === "missing" || outcome === "resolved") {
      return outcome;
    }
  } catch {
    // ioredis-mock and some Redis proxies lack Lua — fall back to WATCH/MULTI.
  }

  return resolveWithWatch(redis, keys, id, result, resolvedAt);
}

async function resolveWithWatch(
  redis: Redis,
  keys: ResolvedKeyPrefix,
  id: string,
  result: HumanResult,
  resolvedAt: string,
): Promise<ResolveOutcome> {
  const reqKey = keys.req(id);
  const pendingKey = keys.idxStatus("pending");
  const resolvedKey = keys.idxStatus("resolved");

  for (let attempt = 0; attempt < 5; attempt++) {
    await redis.watch(reqKey);
    const raw = await redis.get(reqKey);
    if (!raw) {
      await redis.unwatch();
      return "missing";
    }

    const stored = JSON.parse(raw) as StoredHumanRequest;
    if (stored.status !== "pending") {
      await redis.unwatch();
      return "resolved";
    }

    stored.status = "resolved";
    stored.result = result;
    stored.resolvedAt = resolvedAt;

    const rawScore = await redis.zscore(pendingKey, id);
    const score = rawScore === null ? 0 : Number(rawScore);

    const ns = stored.namespace ?? "global";
    const tx = redis.multi();
    tx.set(reqKey, JSON.stringify(stored));
    tx.zrem(pendingKey, id);
    tx.zadd(resolvedKey, score, id);
    tx.zrem(keys.idxNsStatus(ns, "pending"), id);
    tx.zadd(keys.idxNsStatus(ns, "resolved"), score, id);
    const execResult = await tx.exec();
    if (execResult) return "ok";
  }

  const raw = await redis.get(reqKey);
  if (!raw) return "missing";
  const stored = JSON.parse(raw) as StoredHumanRequest;
  return stored.status === "pending" ? "resolved" : "resolved";
}

export function resolveError(id: string, outcome: ResolveOutcome): Error {
  if (outcome === "missing") {
    return new Error(`Unknown human request "${id}"`);
  }
  return new Error(`Human request "${id}" is already resolved`);
}
