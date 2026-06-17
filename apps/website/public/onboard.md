# HITL SDK onboarding

AI Agent setup guide. Human-readable docs live at https://hitl-sdk.dev/docs. Fetch MDX pages below; do not duplicate prose here.

## Disclaimer

- HITL SDK is beta.
- Node.js only.
- APIs may change without notice.

## Links

- LP: https://hitl-sdk.dev
- Docs: https://hitl-sdk.dev/docs
- GitHub: https://github.com/u17g/hitl

## What is this

Human approval layer for mission-critical agentic workflows. Add human-in-the-loop with `waitForHuman`.

Orthogonal axes (compose one choice per axis, not a Cartesian product of guides):

- **Workflow engine**: Workflow SDK (default), Temporal, Inngest
- **State**: in-memory (dev only), SQLite (default for new projects), Postgres, Redis
- **Delivery**: web inbox (always built in; default) + optional Chat SDK adapter for Slack/Teams/Discord/etc.
- **Host**: mount server routes. See host-integration (Next.js default in quickstart)

Chat SDK and web inbox are **not** mutually exclusive. `new Hitl()` always includes the web inbox channel; add `@hitl-sdk/adapter-chat-sdk` only when chat platforms are needed.

## How to setup

### 1. Diagnose the user's project

1. Workflow engine in use or desired?
   - None yet → recommend Workflow SDK (https://workflow-sdk.dev/)
2. Chat platform needed?
   - None / custom UI only → web inbox only
   - Line → also fetch channels/line doc
   - Slack, Teams, Discord, etc. → also fetch chat-sdk doc
3. Database / state backend?
   - None yet → recommend SQLite
   - Production multi-replica → Postgres or Redis
4. Deploy target / host framework?
   - None yet → recommend Vercel + Next.js
   - Known framework → note for host-integration anchor

### 2. Install packages

Core:

```sh
npm i -S @hitl-sdk/hitl
```

Workflow engine (if not installed):

```sh
# Workflow SDK (default)
npm i -S workflow

# Temporal or Inngest. See their docs for worker/client setup
```

Workflow resolver (pick one):

```sh
npm i -S @hitl-sdk/resolver-workflow-sdk   # Workflow SDK
npm i -S @hitl-sdk/resolver-temporal        # Temporal
npm i -S @hitl-sdk/resolver-inngest       # Inngest
```

Chat adapter (optional, only if Slack/Teams/etc.):

```sh
npm i -S chat @hitl-sdk/adapter-chat-sdk @chat-adapter/slack
```

State backend (skip for in-memory dev; pick one for persistence):

```sh
npm i -S @hitl-sdk/state-sqlite    # SQLite (Node 22.13+)
npm i -S @hitl-sdk/state-pg pg     # Postgres
npm i -S @hitl-sdk/state-ioredis ioredis   # Redis
```

### 3. Fetch docs (compose, do not multiply)

Fetch prose from docs: one page per axis, not one page per combination.

1. Always fetch **overview** + **quickstart** first.
2. Fetch exactly **one** workflow engine page from diagnosis.
3. Fetch a **state** page if not using in-memory (recommend sqlite for new projects).
4. Fetch **channels/web-inbox** (default). Also fetch **channels/chat-sdk** if chat platforms are needed.
5. Fetch **host-integration** and use the section matching the user's framework.

**Default when undecided:** Workflow SDK + SQLite + web inbox + Next.js (matches https://github.com/u17g/hitl/tree/main/examples/hello-world).

**Overview + tutorial** (always fetch both):

- https://hitl-sdk.dev/docs/overview
- https://hitl-sdk.dev/docs/quickstart

**Workflow** (pick one):

- https://hitl-sdk.dev/docs/workflow-engines/workflow-sdk
- https://hitl-sdk.dev/docs/workflow-engines/temporal
- https://hitl-sdk.dev/docs/workflow-engines/inngest

**State** (pick one; skip for in-memory):

- https://hitl-sdk.dev/docs/state/sqlite
- https://hitl-sdk.dev/docs/state/postgres
- https://hitl-sdk.dev/docs/state/redis

**Delivery**:

- https://hitl-sdk.dev/docs/channels/web-inbox (default; always fetch)
- https://hitl-sdk.dev/docs/channels/chat-sdk (also fetch if chat platforms are needed)
- https://hitl-sdk.dev/docs/channels/line

**Host** (fetch host-integration; use the section matching the user's framework):

- https://hitl-sdk.dev/docs/host-integration#nextjs
- https://hitl-sdk.dev/docs/host-integration#express
- https://hitl-sdk.dev/docs/host-integration#hono
- https://hitl-sdk.dev/docs/host-integration#fastify
- https://hitl-sdk.dev/docs/host-integration#nestjs
- https://hitl-sdk.dev/docs/host-integration#nitro
- https://hitl-sdk.dev/docs/host-integration#nuxt
- https://hitl-sdk.dev/docs/host-integration#astro
- https://hitl-sdk.dev/docs/host-integration#sveltekit
- https://hitl-sdk.dev/docs/host-integration#vite

**Install reference**:

- https://hitl-sdk.dev/docs/install

**Foundations** (optional):

- https://hitl-sdk.dev/docs/foundations/overview

Each axis page describes **what to change** relative to quickstart. Do not expect a standalone end-to-end guide per URL.

## Concept questions (pre install)

If the user asks conceptual questions before installing, fetch:

- https://hitl-sdk.dev/docs/overview
- https://hitl-sdk.dev/docs/foundations/overview
- https://hitl-sdk.dev/docs/foundations/human-steps
- https://hitl-sdk.dev
- https://github.com/u17g/hitl
