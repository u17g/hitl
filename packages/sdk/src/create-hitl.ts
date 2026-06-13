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
  resolveApproval,
  resolveBatchApproval,
  timeoutApproval,
  timeoutBatch,
  type HitlRuntime,
} from "./core";
import { defaultInMemoryStore, type Store } from "./store";
import type { HitlPlugin } from "./types";
import { FeedbackValidationError } from "./validate";

export interface CreateHitlOptions {
  plugins: HitlPlugin[];
  /** Defaults to one in-memory store per process. Pass `@hitldev/store-postgres` or `@hitldev/store-sqlite` for persistence. */
  store?: Store;
  /** Engine resolver from an engine package, e.g. `workflowResolver()` from `@hitldev/vercel-workflow`. */
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
  /** Next.js route handlers: `export const { GET, POST } = hitl.routeHandlers`. */
  routeHandlers: {
    GET(req: Request): Promise<Response>;
    POST(req: Request): Promise<Response>;
  };
  runtime: HitlRuntime;
  store: Store;
  plugins: HitlPlugin[];
}

export function createHitlRuntime(options: CreateHitlOptions): HitlRuntime {
  return {
    plugins: options.plugins,
    store: options.store ?? defaultInMemoryStore(),
    resolver: options.resolver,
  };
}

export function createHitlApp(runtime: HitlRuntime, options?: { secret?: string }): HitlApp {
  const { store, plugins } = runtime;
  const secret = options?.secret ?? process.env.HITLDEV_SECRET;

  const fetchHandler = async (req: Request): Promise<Response> => {
    const segments = new URL(req.url).pathname.split("/").filter(Boolean);

    if (req.method === "GET") {
      return handleInboxApi(store, req, segments);
    }
    if (req.method === "POST") {
      const route = matchInternalRoute(segments);
      if (route) {
        if (!authorizeInternalApi(req, secret)) {
          return json({ error: "Unauthorized" }, 401);
        }
        return handleInternalApi(runtime, req, route);
      }
      return handleCallback(runtime, req);
    }
    return json({ error: "Method not allowed" }, 405);
  };

  return {
    fetch: fetchHandler,
    routeHandlers: { GET: fetchHandler, POST: fetchHandler },
    handler: (req, res) => nodeHandler(fetchHandler, req, res),
    runtime,
    store,
    plugins,
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

async function handleInboxApi(
  store: Store,
  req: Request,
  segments: string[],
): Promise<Response> {
  const batchesIndex = segments.lastIndexOf("batches");
  if (batchesIndex !== -1) {
    const id = segments[batchesIndex + 1];
    if (id === undefined) return json({ error: "Not found" }, 404);
    const batch = await store.getBatch(id);
    if (!batch) return json({ error: `Unknown batch "${id}"` }, 404);
    return json({ batch, items: await store.listByBatch(id) });
  }

  const approvalsIndex = segments.lastIndexOf("approvals");
  if (approvalsIndex === -1) return json({ error: "Not found" }, 404);

  const id = segments[approvalsIndex + 1];
  if (id !== undefined) {
    const record = await store.get(id);
    return record ? json(record) : json({ error: `Unknown approval "${id}"` }, 404);
  }

  const statusParam = new URL(req.url).searchParams.get("status");
  const status = statusParam === "pending" || statusParam === "resolved" ? statusParam : undefined;
  const approvals = await store.list(status ? { status } : undefined);
  return json({ approvals });
}

async function handleCallback(runtime: HitlRuntime, req: Request): Promise<Response> {
  for (const plugin of runtime.plugins) {
    if (!plugin.handleCallback) continue;

    const callback = await plugin.handleCallback(req.clone());
    if (!callback) continue;

    try {
      if (callback.ackOnly) {
        return callback.response ?? new Response(null, { status: 204 });
      }
      if ("decisions" in callback) {
        const results = await resolveBatchApproval(runtime, callback);
        return callback.response ?? json({ ok: true, results });
      }
      const result = await resolveApproval(runtime, callback);
      return callback.response ?? json({ ok: true, result });
    } catch (error) {
      if (error instanceof FeedbackValidationError) {
        return json({ error: error.message }, 400);
      }
      throw error;
    }
  }
  return json({ error: "No plugin recognized this callback" }, 404);
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
