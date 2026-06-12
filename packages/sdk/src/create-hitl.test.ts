import { describe, expect, it, vi } from "vitest";
import type { EngineBinding, EngineSuspension } from "./binding";
import { createHitl, getRuntime, resetRuntime } from "./create-hitl";
import { hitl } from "./fields";
import type { HitlCallback, HitlPlugin } from "./types";

// Test list:
// - createHitl registers a runtime that waitForApproval can resolve
// - POST dispatches to the first plugin whose handleCallback returns non-null,
//   resolves the approval, and returns 200 (or the plugin-provided response)
// - POST with no matching plugin -> 404
// - invalid feedbacks -> 400
// - GET /approvals lists records (with ?status= filter)
// - GET /approvals/:id returns one record; 404 when unknown
// - routeHandlers.GET/POST and the Node handler delegate to the same fetch logic

class FakeBinding implements EngineBinding {
  waits = new Map<string, (payload: unknown) => void>();
  private counter = 0;

  suspend<T>(): EngineSuspension<T> {
    const token = `tok_${++this.counter}`;
    let resolveFn!: (payload: T) => void;
    const promise = new Promise<T>((resolve) => (resolveFn = resolve));
    this.waits.set(token, resolveFn as (payload: unknown) => void);
    return { token, promise };
  }

  async resolve(token: string, payload: unknown): Promise<void> {
    this.waits.get(token)?.(payload);
  }

  async sleep(): Promise<void> {}
}

/** A plugin whose callback parser accepts JSON bodies with a matching pluginId. */
function jsonPlugin(id: string): HitlPlugin {
  return {
    id,
    async send(request) {
      return { externalId: `ext_${request.id}` };
    },
    async notify() {},
    async handleCallback(req): Promise<HitlCallback | null> {
      const body = (await req.clone().json()) as Record<string, unknown>;
      if (body.pluginId !== id) return null;
      return {
        requestId: body.requestId as string,
        decision: body.decision as "approve" | "deny",
        feedbacks: body.feedbacks as Record<string, unknown> | undefined,
      };
    },
  };
}

async function startApproval(app: ReturnType<typeof createHitl>, _binding: FakeBinding) {
  const promise = getRuntime().then((runtime) =>
    import("./core").then(({ requestApproval }) =>
      requestApproval(runtime, {
        message: "Approve?",
        feedbacks: { subject: hitl.textField({ label: "Subject", default: "Hi" }) },
      }),
    ),
  );
  const requestId = await vi.waitFor(async () => {
    const [record] = await app.store.list({ status: "pending" });
    expect(record).toBeTruthy();
    return record!.id;
  });
  return { promise, requestId };
}

function setup(pluginIds: string[] = ["a", "b"]) {
  resetRuntime();
  const binding = new FakeBinding();
  const app = createHitl({ plugins: pluginIds.map(jsonPlugin), binding });
  return { binding, app };
}

describe("createHitl callback dispatch", () => {
  it("dispatches POST to the matching plugin and resolves the approval", async () => {
    const { app, binding } = setup();
    const { promise, requestId } = await startApproval(app, binding);

    const res = await app.fetch(
      new Request("http://x/hitl/callback", {
        method: "POST",
        body: JSON.stringify({ pluginId: "a", requestId, decision: "approve" }),
      }),
    );

    expect(res.status).toBe(200);
    expect(await promise).toMatchObject({ type: "APPROVED", id: requestId });
  });

  it("returns 404 when no plugin recognizes the callback", async () => {
    const { app } = setup();
    const res = await app.fetch(
      new Request("http://x/hitl/callback", {
        method: "POST",
        body: JSON.stringify({ pluginId: "unknown" }),
      }),
    );
    expect(res.status).toBe(404);
  });

  it("returns 400 on invalid feedbacks", async () => {
    const { app, binding } = setup();
    const { requestId } = await startApproval(app, binding);

    const res = await app.fetch(
      new Request("http://x/hitl/callback", {
        method: "POST",
        body: JSON.stringify({
          pluginId: "a",
          requestId,
          decision: "approve",
          feedbacks: { bogus: "x" },
        }),
      }),
    );
    expect(res.status).toBe(400);
  });
});

describe("inbox API", () => {
  it("lists approvals, filterable by status", async () => {
    const { app, binding } = setup();
    const { promise, requestId } = await startApproval(app, binding);

    const pendingRes = await app.fetch(new Request("http://x/hitl/approvals?status=pending"));
    expect(pendingRes.status).toBe(200);
    const pendingBody = (await pendingRes.json()) as { approvals: { id: string }[] };
    expect(pendingBody.approvals.map((a) => a.id)).toEqual([requestId]);

    await app.fetch(
      new Request("http://x/hitl/callback", {
        method: "POST",
        body: JSON.stringify({ pluginId: "a", requestId, decision: "approve" }),
      }),
    );
    await promise;

    const stillPending = await app.fetch(new Request("http://x/hitl/approvals?status=pending"));
    expect(((await stillPending.json()) as { approvals: unknown[] }).approvals).toEqual([]);
  });

  it("returns a single approval for audit lookups", async () => {
    const { app, binding } = setup();
    const { promise, requestId } = await startApproval(app, binding);

    const res = await app.fetch(new Request(`http://x/hitl/approvals/${requestId}`));
    expect(res.status).toBe(200);
    expect((await res.json()) as { id: string }).toMatchObject({ id: requestId });

    const missing = await app.fetch(new Request("http://x/hitl/approvals/nope"));
    expect(missing.status).toBe(404);

    await app.fetch(
      new Request("http://x/hitl/callback", {
        method: "POST",
        body: JSON.stringify({ pluginId: "a", requestId, decision: "deny" }),
      }),
    );
    await promise;
  });
});

describe("adapters", () => {
  it("routeHandlers delegate to fetch", async () => {
    const { app } = setup();
    const res = await app.routeHandlers.GET(new Request("http://x/hitl/approvals"));
    expect(res.status).toBe(200);
  });

  it("the Node handler bridges req/res", async () => {
    const { app } = setup();

    const chunks: Buffer[] = [];
    let statusCode = 0;
    let ended = false;
    const req = Object.assign(
      (async function* () {})(), // empty body
      { method: "GET", url: "/hitl/approvals", headers: { host: "x" } },
    );
    const res = {
      writeHead(status: number) {
        statusCode = status;
        return this;
      },
      end(body?: string | Buffer) {
        if (body) chunks.push(Buffer.from(body));
        ended = true;
      },
    };

    await app.handler(req as never, res as never);
    expect(statusCode).toBe(200);
    expect(ended).toBe(true);
    expect(JSON.parse(Buffer.concat(chunks).toString())).toHaveProperty("approvals");
  });
});
