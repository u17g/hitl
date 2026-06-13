import type { IncomingMessage, ServerResponse } from "node:http";
import type { CreateBatchBody, CreateRequestBody, NotifyBody, RemindBody } from "./api-types";
import { authorizeInternalApi } from "./auth";
import type { HitlResolver } from "./binding";
import {
  createApprovalRequest,
  createBatchRequest,
  NotFoundError,
  notifyVia,
  remindApproval,
  remindBatch,
  timeoutApproval,
  timeoutBatch,
  type HitlRuntime,
} from "./core";
import { INBOX_CHANNEL_ID, inboxChannel } from "./inbox-channel";
import { createInbox, type HitlInbox } from "./inbox";
import { defaultInMemoryState, type State } from "./state";
import type { HitlPlugin } from "./types";

export interface CreateHitlOptions {
  /**
   * Channel plugins (Slack, Teams, …). Optional: the built-in web inbox channel
   * is always included, so workflows can deliver to the inbox and `hitl.inbox`
   * works with no plugins configured. The first entry is the default channel.
   */
  plugins?: HitlPlugin[];
  /** Defaults to one in-memory state per process. Pass `@hitl/state-pg` or `@hitl/state-sqlite` for persistence. */
  state?: State;
  /** Engine resolver from an engine package, e.g. `workflowResolver()` from `@hitl/resolver-workflow-sdk`. */
  resolver: HitlResolver;
  /**
   * Bearer secret of the internal workflow → server API.
   * Defaults to `process.env.HITLDEV_SECRET`; without one the internal API is
   * open (local development) and a warning is logged once.
   */
  secret?: string;
}

export interface HitlApp {
  /** Fetch-style handler at the core of every adapter. Mount under `/.well-known/hitldev/v1` (or any base path). */
  fetch(req: Request): Promise<Response>;
  /** Node/Express-style handler. */
  handler(req: IncomingMessage, res: ServerResponse): Promise<void>;
  /** Next.js route handlers: `export const { POST } = hitl.routeHandlers`. */
  routeHandlers: {
    POST(req: Request): Promise<Response>;
  };
  runtime: HitlRuntime;
  state: State;
  plugins: HitlPlugin[];
  /** Programmatic inbox: read state and resolve approvals from your own handlers. */
  inbox: HitlInbox;
}

export function createHitlRuntime(options: CreateHitlOptions): HitlRuntime {
  const configured = options.plugins ?? [];
  // The web inbox is always available as a channel, unless the app already
  // registered one under its id; configured channels take precedence as default.
  const plugins = configured.some((p) => p.id === INBOX_CHANNEL_ID)
    ? configured
    : [...configured, inboxChannel()];
  return {
    plugins,
    state: options.state ?? defaultInMemoryState(),
    resolver: options.resolver,
  };
}

export function createHitlApp(runtime: HitlRuntime, options?: { secret?: string }): HitlApp {
  const { state, plugins } = runtime;
  const inbox = createInbox(runtime);
  const secret = options?.secret ?? process.env.HITLDEV_SECRET;

  const fetchHandler = async (req: Request): Promise<Response> => {
    if (req.method !== "POST") {
      return json({ error: "Method not allowed" }, 405);
    }
    const segments = new URL(req.url).pathname.split("/").filter(Boolean);
    const route = matchInternalRoute(segments);
    if (!route) {
      return json({ error: "Not found" }, 404);
    }
    if (!authorizeInternalApi(req, secret)) {
      return json({ error: "Unauthorized" }, 401);
    }
    return handleInternalApi(runtime, req, route);
  };

  return {
    fetch: fetchHandler,
    routeHandlers: { POST: fetchHandler },
    handler: (req, res) => nodeHandler(fetchHandler, req, res),
    runtime,
    state,
    plugins,
    inbox,
  };
}

export function createHitl(options: CreateHitlOptions): HitlApp {
  return createHitlApp(createHitlRuntime(options), { secret: options.secret });
}

type InternalRoute =
  | { kind: "create-request" }
  | { kind: "create-batch" }
  | { kind: "notify" }
  | { kind: "request-timeout" | "request-remind"; id: string }
  | { kind: "batch-timeout" | "batch-remind"; id: string };

/** Internal workflow → server routes, matched on the trailing path segments. */
function matchInternalRoute(segments: string[]): InternalRoute | null {
  const last = segments.at(-1);
  if (last === "requests") return { kind: "create-request" };
  if (last === "batches") return { kind: "create-batch" };
  if (last === "notifications") return { kind: "notify" };

  if (last === "timeout" || last === "remind") {
    const collection = segments.at(-3);
    const id = segments.at(-2);
    if (id === undefined) return null;
    if (collection === "requests") {
      return { kind: last === "timeout" ? "request-timeout" : "request-remind", id };
    }
    if (collection === "batches") {
      return { kind: last === "timeout" ? "batch-timeout" : "batch-remind", id };
    }
  }
  return null;
}

async function handleInternalApi(
  runtime: HitlRuntime,
  req: Request,
  route: InternalRoute,
): Promise<Response> {
  let body: unknown;
  if (route.kind !== "request-timeout" && route.kind !== "batch-timeout") {
    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }
  }

  try {
    switch (route.kind) {
      case "create-request": {
        const create = body as Partial<CreateRequestBody>;
        if (typeof create.token !== "string" || typeof create.message !== "string") {
          return json({ error: "token and message are required" }, 400);
        }
        const result = await createApprovalRequest(runtime, {
          ...create,
          token: create.token,
          message: create.message,
          fields: create.fields ?? {},
        });
        return json(result, 201);
      }
      case "create-batch": {
        const create = body as Partial<CreateBatchBody>;
        if (!Array.isArray(create.items) || create.items.length === 0) {
          return json({ error: "items must be a non-empty array" }, 400);
        }
        const result = await createBatchRequest(runtime, {
          ...create,
          fields: create.fields ?? {},
          items: create.items,
        });
        return json(result, 201);
      }
      case "request-timeout":
        return json({ result: await timeoutApproval(runtime, route.id) });
      case "batch-timeout":
        return json({ results: await timeoutBatch(runtime, route.id) });
      case "request-remind":
        return json(await remindApproval(runtime, route.id, body as RemindBody));
      case "batch-remind":
        return json(await remindBatch(runtime, route.id, body as RemindBody));
      case "notify":
        await notifyVia(runtime, body as NotifyBody);
        return json({ ok: true });
    }
  } catch (error) {
    if (error instanceof NotFoundError) {
      return json({ error: error.message }, 404);
    }
    throw error;
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function nodeHandler(
  fetchHandler: (req: Request) => Promise<Response>,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const host = req.headers.host ?? "localhost";
  const url = `http://${host}${req.url ?? "/"}`;

  const method = req.method ?? "GET";
  let body: Uint8Array<ArrayBuffer> | undefined;
  if (method !== "GET" && method !== "HEAD") {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    body = Uint8Array.from(Buffer.concat(chunks));
  }

  const response = await fetchHandler(
    new Request(url, {
      method,
      headers: Object.entries(req.headers).flatMap(([key, value]) =>
        value === undefined
          ? []
          : Array.isArray(value)
            ? value.map((v) => [key, v] as [string, string])
            : [[key, value] as [string, string]],
      ),
      body,
    }),
  );

  res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
  res.end(Buffer.from(await response.arrayBuffer()));
}
