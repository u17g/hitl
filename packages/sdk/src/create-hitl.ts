import type { IncomingMessage, ServerResponse } from "node:http";
import type { EngineBinding } from "./binding";
import { resolveApproval, type HitlRuntime } from "./core";
import { InMemoryStore, type Store } from "./store";
import type { HitlPlugin } from "./types";
import { FeedbackValidationError } from "./validate";

export interface CreateHitlOptions {
  plugins: HitlPlugin[];
  /** Defaults to the in-memory store. Swap for `@hitldev/store-postgres` or `@hitldev/store-sqlite` in production. */
  store?: Store;
  /** Engine binding from an engine package, e.g. `vercelWorkflowBinding()` from `@hitldev/vercel-workflow`. */
  binding: EngineBinding;
}

export interface HitlApp {
  /** Fetch-style handler at the core of every adapter. Mount under any base path. */
  fetch(req: Request): Promise<Response>;
  /** Node/Express-style handler. */
  handler(req: IncomingMessage, res: ServerResponse): Promise<void>;
  /** Next.js route handlers: `export const { GET, POST } = hitlApp.routeHandlers`. */
  routeHandlers: {
    GET(req: Request): Promise<Response>;
    POST(req: Request): Promise<Response>;
  };
  store: Store;
  plugins: HitlPlugin[];
}

let registry: HitlRuntime | null = null;

/** The runtime `waitForApproval` / `notify` operate against. */
export function getRuntime(): HitlRuntime {
  if (!registry) {
    throw new Error("hitldev is not configured. Call createHitl() at your app edge first.");
  }
  return registry;
}

/** Test seam: clears the module-level registry. */
export function resetRuntime(): void {
  registry = null;
}

export function createHitl(options: CreateHitlOptions): HitlApp {
  const store = options.store ?? new InMemoryStore();
  const { plugins } = options;

  registry = { plugins, store, binding: options.binding };

  const fetchHandler = async (req: Request): Promise<Response> => {
    const runtime = getRuntime();
    const segments = new URL(req.url).pathname.split("/").filter(Boolean);

    if (req.method === "GET") {
      return handleInboxApi(store, req, segments);
    }
    if (req.method === "POST") {
      return handleCallback(runtime, req);
    }
    return json({ error: "Method not allowed" }, 405);
  };

  return {
    fetch: fetchHandler,
    routeHandlers: { GET: fetchHandler, POST: fetchHandler },
    handler: (req, res) => nodeHandler(fetchHandler, req, res),
    store,
    plugins,
  };
}

async function handleInboxApi(
  store: Store,
  req: Request,
  segments: string[],
): Promise<Response> {
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
