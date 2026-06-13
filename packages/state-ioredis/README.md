# @hitl/state-ioredis

Redis-backed `State` for Hitl. Bring your own [ioredis](https://github.com/redis/ioredis) client — the package implements approval persistence and applies key-layout migrations on connect.

## Install

```bash
npm install hitl @hitl/state-ioredis ioredis
```

`hitl` is a peer dependency. You construct and own the Redis connection.

## Usage

For most apps, migrations run automatically on the first operation (or call `ensureSchema()` explicitly at deploy time):

```ts
import Redis from "ioredis";
import { Hitl } from "hitl";
import { IoredisState } from "@hitl/state-ioredis";

const redis = new Redis(process.env.REDIS_URL);
const state = new IoredisState(redis);
await state.ensureSchema();

export const hitl = new Hitl({ state, resolver: /* … */ });
```

Use a custom key prefix (same option name as SQL backends):

```ts
const state = new IoredisState(redis, { tableName: "custom_approvals" });
// Redis keys are prefixed with `custom_approvals:`
```

## Key layout

Default prefix: `hitl:human_requests` (from table name `hitl.human_requests`).

| Purpose | Key pattern | Type |
|---------|-------------|------|
| Human request | `{prefix}:req:{id}` | STRING (JSON) |
| Token index | `{prefix}:idx:token:{token}` | STRING → id |
| External ID index | `{prefix}:idx:ext:{externalId}` | STRING → id |
| Status index | `{prefix}:idx:status:{pending\|resolved}` | SET of ids |
| All requests | `{prefix}:idx:all:req` | SET of ids |
| Batch | `{prefix}:batch:{id}` | STRING (JSON) |
| Batch external index | `{prefix}:idx:batch:ext:{externalId}` | STRING → id |
| Batch items | `{prefix}:idx:batch:{batchId}` | ZSET (score = batchIndex) |
| Timeline entry | `{prefix}:timeline:entry:{id}` | STRING (JSON) |
| Timeline thread | `{prefix}:timeline:{threadId}` | ZSET (score = createdAt ms) |
| Notify delivery | `{prefix}:notify:{id}` | STRING (JSON) |
| Notify external index | `{prefix}:idx:notify:ext:{externalId}` | STRING → id |
| Migration ledger | `{prefix}:meta:migrations` | SET of migration ids |

## Schema migrations

Key-layout changes are versioned inside this package (`SCHEMA_VERSION`). Opening a connection with `IoredisState` (or calling `ensureSchema()`) applies pending migrations idempotently after you upgrade `@hitl/state-ioredis`.

```ts
import { SCHEMA_VERSION } from "@hitl/state-ioredis";
```

No setup CLI is required — migrations run in-process against your Redis instance.
