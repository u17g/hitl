# @hitl/state-pg

Postgres-backed `State` for Hitl. Bring your own `pg` pool — the package implements approval persistence and ships a setup CLI (same idea as [Workflow DevKit's `workflow-postgres-setup`](https://workflow-sdk.dev/worlds/postgres)).

## Install

```bash
npm install hitl @hitl/state-pg pg
```

`hitl` and `pg` are peer dependencies in practice: you need a Postgres client to construct `PostgresState`.

## Setup

Run migrations **before** deploying or on first boot in production. The default table is `hitl.approvals`.

```bash
export HITL_POSTGRES_URL=postgres://user:password@host:5432/database
npx @hitl/state-pg setup
```

`DATABASE_URL` and `WORKFLOW_POSTGRES_URL` are also accepted as fallbacks (same precedence as other `HITL_*` env vars in this SDK). Prefer `HITL_POSTGRES_URL` so Hitl persistence is explicit and separate from WDK's Postgres world.

Custom table name:

```bash
npx @hitl/state-pg setup --table custom_approvals
```

### Export DDL (no database connection)

Print idempotent SQL to stdout — useful for hand-managed migration pipelines:

```bash
npx @hitl/state-pg schema
npx @hitl/state-pg schema --table custom_approvals
```

Programmatically:

```ts
import { schemaSql, migrationSql, SCHEMA_VERSION } from "@hitl/state-pg";

schemaSql(); // all migrations concatenated
migrationSql("001_initial", "hitl.approvals"); // single migration
```

### Workflow DevKit Postgres world

This package only creates **Hitl** tables. If you use Workflow DevKit with the Postgres world, run its migrations separately:

```bash
npx workflow-postgres-setup
```

## Usage

```ts
import pg from "pg";
import { Hitl } from "hitl";
import { PostgresState } from "@hitl/state-pg";

const pool = new pg.Pool({
  connectionString: process.env.HITL_POSTGRES_URL ?? process.env.DATABASE_URL,
});

const state = new PostgresState(pool);
await state.ensureSchema(); // idempotent; or rely on `npx @hitl/state-pg setup` at deploy time

export const hitl = new Hitl({ state, /* resolver, adapters, … */ });
```

`PostgresState` accepts any object that implements `PgQueryable` (`query(sql, params?)`), so Neon, Supabase, or `pg-mem` pools work as long as they speak Postgres SQL.

## Migrations

Schema changes are versioned inside this package (`SCHEMA_VERSION`). Re-run `setup` or `ensureSchema()` after upgrading `@hitl/state-pg` to apply new migrations idempotently.
