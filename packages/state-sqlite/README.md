# @hitl/state-sqlite

SQLite-backed `State` for Hitl, built on Node's built-in [`node:sqlite`](https://nodejs.org/api/sqlite.html). Zero runtime dependencies.

Requires **Node.js 22.13.0+**.

## Install

```bash
npm install hitl @hitl/state-sqlite
```

## Setup

For most apps, **no setup step is required**. Constructing `SqliteState` runs migrations automatically (synchronous and idempotent):

```ts
import { DatabaseSync } from "node:sqlite";
import { SqliteState } from "@hitl/state-sqlite";

const state = new SqliteState(new DatabaseSync(".hitl/human_requests.db"));
```

See [`examples/hello-world`](../../examples/hello-world/lib/hitl-state.ts) for a lazy singleton pattern.

### CLI (optional)

Use the CLI when you want to initialize a database file outside your app — CI, scripts, or infra that runs before the server starts:

```bash
npx @hitl/state-sqlite setup --db .hitl/human_requests.db
npx @hitl/state-sqlite setup --db .hitl/human_requests.db --table custom_approvals
```

Export DDL without opening a database:

```bash
npx @hitl/state-sqlite schema
npx @hitl/state-sqlite schema --table custom_approvals
```

Programmatically:

```ts
import { schemaSql, migrationSql, SCHEMA_VERSION } from "@hitl/state-sqlite";

schemaSql();
migrationSql("001_initial", "hitl.human_requests");
```

## Usage

```ts
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { Hitl } from "hitl";
import { SqliteState } from "@hitl/state-sqlite";

const dbPath = join(process.cwd(), ".hitl", "human_requests.db");
mkdirSync(join(process.cwd(), ".hitl"), { recursive: true });

const state = new SqliteState(new DatabaseSync(dbPath));

export const hitl = new Hitl({ state, /* resolver, adapters, … */ });
```

## Migrations

Schema changes are versioned inside this package (`SCHEMA_VERSION`). Opening the database with `SqliteState` (or re-running `setup`) applies new migrations idempotently after you upgrade `@hitl/state-sqlite`.

Upgrading from the legacy default table `hitl.approvals` is handled automatically by migration `006_rename_human_requests` when you use the new default `hitl.human_requests`. Custom `--table` names are not renamed automatically.
