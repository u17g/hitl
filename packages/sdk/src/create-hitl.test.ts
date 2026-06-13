import { describe, expect, it } from "vitest";
import type { HitlResolver } from "./binding";
import { createHitl } from "./create-hitl";
import { field } from "./fields";
import { InMemoryStore } from "./store";
import type {
  ApprovalRequest,
  BatchApprovalRequest,
  HitlBatchCallback,
  HitlCallback,
  HitlPlugin,
  Notification,
} from "./types";

// Test list:
// - POST {base}/requests creates an approval (201 { id }) and delivers it
// - the internal API is idempotent on the resume token
// - with a secret configured: missing/wrong bearer -> 401, correct bearer -> 201
// - plugin callbacks and the GET inbox are NOT behind the internal-API bearer
// - POST {base}/requests/:id/timeout -> 200 { result }; unknown id -> 404
// - POST {base}/requests/:id/remind -> 200 { pending }
// - POST {base}/batches creates a batch (201 { batchId, ids })
// - POST {base}/batches/:id/timeout and /remind work like the approval ones
// - POST {base}/notifications routes a notify
// - malformed JSON on an internal route -> 400
// - POST dispatches to the first plugin whose handleCallback returns non-null
// - POST with no matching plugin -> 404; invalid feedbacks -> 400
// - GET /approvals (+ ?status=), GET /approvals/:id, GET /batches/:id
// - app.inbox reads/writes match the HTTP inbox; POST /approvals/:id and /batches/:id resolve
// - the inbox write routes map unknown id -> 404, invalid feedbacks -> 400
// - routeHandlers.GET/POST and the Node handler delegate to the same fetch logic

const BASE = "http://x/.well-known/hitldev/v1";

class FakeResolver implements HitlResolver {
  readonly resolved: Array<{ token: string; payload: unknown }> = [];

  async resolve(token: string, payload: unknown): Promise<void> {
    this.resolved.push({ token, payload });
  }
}

interface FakePlugin extends HitlPlugin {
  sent: ApprovalRequest[];
  sentBatches: BatchApprovalRequest[];
  notifications: Notification[];
}

/** A plugin whose callback parser accepts JSON bodies with a matching pluginId. */
function jsonPlugin(id: string): FakePlugin {
  const sent: ApprovalRequest[] = [];
  const sentBatches: BatchApprovalRequest[] = [];
  const notifications: Notification[] = [];
  return {
    id,
    sent,
    sentBatches,
    notifications,
    async send(request) {
      sent.push(request);
      return { externalId: `ext_${request.id}` };
    },
    async sendBatch(request) {
      sentBatches.push(request);
      return { externalId: `bext_${request.batchId}` };
    },
    async notify(notification) {
      notifications.push(notification);
    },
    async handleCallback(req): Promise<HitlCallback | HitlBatchCallback | null> {
      let body: Record<string, unknown>;
      try {
        body = (await req.clone().json()) as Record<string, unknown>;
      } catch {
        return null;
      }
      if (body.pluginId !== id) return null;
      if (body.batchId !== undefined) {
        return {
          batchId: body.batchId as string,
          decisions: body.decisions as HitlBatchCallback["decisions"],
        };
      }
      return {
        requestId: body.requestId as string,
        decision: body.decision as "approve" | "deny",
        feedbacks: body.feedbacks as Record<string, unknown> | undefined,
      };
    },
  };
}

function setup(opts?: { secret?: string; pluginIds?: string[] }) {
  const resolver = new FakeResolver();
  const plugins = (opts?.pluginIds ?? ["a", "b"]).map(jsonPlugin);
  const app = createHitl({
    plugins,
    store: new InMemoryStore(),
    resolver,
    secret: opts?.secret,
  });
  return { resolver, plugins, app };
}

function post(
  app: ReturnType<typeof createHitl>,
  path: string,
  body: unknown,
  headers?: Record<string, string>,
): Promise<Response> {
  return app.fetch(
    new Request(`${BASE}${path}`, {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body),
      headers,
    }),
  );
}

const fields = { subject: field.textField({ label: "Subject", default: "Hi" }) };

async function createRequest(app: ReturnType<typeof createHitl>, token = "tok_1") {
  const res = await post(app, "/requests", { token, message: "Approve?", fields });
  expect(res.status).toBe(201);
  return ((await res.json()) as { id: string }).id;
}

async function createBatch(app: ReturnType<typeof createHitl>) {
  const res = await post(app, "/batches", {
    title: "Outbound emails",
    fields,
    items: [
      { token: "tok_0", message: "Email A", fields },
      { token: "tok_1", message: "Email B", fields },
    ],
  });
  expect(res.status).toBe(201);
  return (await res.json()) as { batchId: string; ids: string[] };
}

describe("internal API: requests", () => {
  it("POST /requests creates and delivers an approval", async () => {
    const { app, plugins } = setup();

    const id = await createRequest(app);

    expect(plugins[0]!.sent).toHaveLength(1);
    expect(plugins[0]!.sent[0]).toMatchObject({ id, message: "Approve?" });
    const record = await app.store.get(id);
    expect(record).toMatchObject({ token: "tok_1", status: "pending" });
  });

  it("is idempotent on the resume token", async () => {
    const { app, plugins } = setup();

    const first = await createRequest(app);
    const second = await createRequest(app);

    expect(second).toBe(first);
    expect(plugins[0]!.sent).toHaveLength(1);
  });

  it("POST /requests/:id/timeout resolves a pending approval", async () => {
    const { app } = setup();
    const id = await createRequest(app);

    const res = await post(app, `/requests/${id}/timeout`, {});

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ result: { type: "TIMED_OUT", id } });
    expect((await app.store.get(id))?.status).toBe("resolved");
  });

  it("POST /requests/:id/timeout returns 404 for an unknown id", async () => {
    const { app } = setup();
    const res = await post(app, "/requests/missing/timeout", {});
    expect(res.status).toBe(404);
  });

  it("POST /requests/:id/remind sends a reminder while pending", async () => {
    const { app, plugins } = setup();
    const id = await createRequest(app);

    const res = await post(app, `/requests/${id}/remind`, {
      kind: "remind",
      message: "Still waiting",
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ pending: true });
    expect(plugins[0]!.notifications[0]).toMatchObject({ message: "Still waiting", parent: id });
  });

  it("returns 400 on malformed JSON", async () => {
    const { app } = setup();
    const res = await post(app, "/requests", "{nope");
    expect(res.status).toBe(400);
  });
});

describe("internal API: batches", () => {
  it("POST /batches creates and delivers a batch", async () => {
    const { app, plugins } = setup();

    const { batchId, ids } = await createBatch(app);

    expect(ids).toEqual([`${batchId}:0`, `${batchId}:1`]);
    expect(plugins[0]!.sentBatches).toHaveLength(1);
    expect((await app.store.listByBatch(batchId)).map((r) => r.token)).toEqual([
      "tok_0",
      "tok_1",
    ]);
  });

  it("POST /batches/:id/timeout resolves pending items", async () => {
    const { app } = setup();
    const { batchId } = await createBatch(app);

    const res = await post(app, `/batches/${batchId}/timeout`, {});

    expect(res.status).toBe(200);
    const { results } = (await res.json()) as { results: { type: string }[] };
    expect(results.map((r) => r.type)).toEqual(["TIMED_OUT", "TIMED_OUT"]);
  });

  it("POST /batches/:id/remind reports pending state", async () => {
    const { app, plugins } = setup();
    const { batchId } = await createBatch(app);

    const res = await post(app, `/batches/${batchId}/remind`, { kind: "remind" });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ pending: true });
    expect(plugins[0]!.notifications).toHaveLength(1);
  });
});

describe("internal API: notifications", () => {
  it("POST /notifications routes a notify", async () => {
    const { app, plugins } = setup();

    const res = await post(app, "/notifications", { message: "progress", channel: "b" });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(plugins[1]!.notifications).toEqual([{ message: "progress", channel: "b" }]);
  });
});

describe("internal API auth", () => {
  const auth = { authorization: "Bearer s3cret" };

  it("rejects a missing or wrong bearer with 401 when a secret is configured", async () => {
    const { app } = setup({ secret: "s3cret" });

    const missing = await post(app, "/requests", { token: "t", message: "m", fields: {} });
    expect(missing.status).toBe(401);

    const wrong = await post(
      app,
      "/requests",
      { token: "t", message: "m", fields: {} },
      { authorization: "Bearer nope" },
    );
    expect(wrong.status).toBe(401);
  });

  it("accepts the matching bearer", async () => {
    const { app } = setup({ secret: "s3cret" });
    const res = await post(app, "/requests", { token: "t", message: "m", fields: {} }, auth);
    expect(res.status).toBe(201);
  });

  it("does not gate plugin callbacks or the inbox behind the bearer", async () => {
    const { app, resolver } = setup({ secret: "s3cret" });
    const id = (
      (await (
        await post(app, "/requests", { token: "tok_1", message: "m", fields }, auth)
      ).json()) as { id: string }
    ).id;

    // Channel callbacks authenticate themselves (e.g. Slack signing); no bearer here.
    const callback = await post(app, "/callback", { pluginId: "a", requestId: id, decision: "approve" });
    expect(callback.status).toBe(200);
    expect(resolver.resolved).toHaveLength(1);

    const inbox = await app.fetch(new Request(`${BASE}/approvals`));
    expect(inbox.status).toBe(200);
  });
});

describe("callback dispatch", () => {
  it("dispatches POST to the matching plugin and resolves the approval", async () => {
    const { app, resolver } = setup();
    const id = await createRequest(app);

    const res = await post(app, "/callback", { pluginId: "a", requestId: id, decision: "approve" });

    expect(res.status).toBe(200);
    expect(resolver.resolved).toEqual([
      { token: "tok_1", payload: { type: "APPROVED", id } },
    ]);
  });

  it("returns 404 when no plugin recognizes the callback", async () => {
    const { app } = setup();
    const res = await post(app, "/callback", { pluginId: "unknown" });
    expect(res.status).toBe(404);
  });

  it("returns ackOnly response without resolving the approval", async () => {
    const resolver = new FakeResolver();
    const ackPlugin: HitlPlugin = {
      id: "ack",
      async send(request) {
        return { externalId: `ext_${request.id}` };
      },
      async notify() {},
      async handleCallback(): Promise<HitlCallback | null> {
        return {
          requestId: "ignored",
          decision: "approve",
          ackOnly: true,
          response: new Response(JSON.stringify({ type: 9 }), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        };
      },
    };
    const app = createHitl({ plugins: [ackPlugin], resolver, store: new InMemoryStore() });

    const res = await post(app, "/callback", {});

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ type: 9 });
    expect(resolver.resolved).toHaveLength(0);
  });

  it("returns 400 on invalid feedbacks", async () => {
    const { app } = setup();
    const id = await createRequest(app);

    const res = await post(app, "/callback", {
      pluginId: "a",
      requestId: id,
      decision: "approve",
      feedbacks: { bogus: "x" },
    });
    expect(res.status).toBe(400);
  });

  it("dispatches a batch submit and resolves every item", async () => {
    const { app, resolver } = setup();
    const { batchId } = await createBatch(app);

    const res = await post(app, "/callback", {
      pluginId: "a",
      batchId,
      decisions: [
        { requestId: `${batchId}:0`, decision: "approve" },
        { requestId: `${batchId}:1`, decision: "deny", reason: "no" },
      ],
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; results: { type: string }[] };
    expect(body.ok).toBe(true);
    expect(body.results.map((r) => r.type)).toEqual(["APPROVED", "DENIED"]);
    expect(resolver.resolved.map((r) => r.token)).toEqual(["tok_0", "tok_1"]);
  });
});

describe("inbox API", () => {
  it("returns a batch with its items", async () => {
    const { app } = setup();
    const { batchId } = await createBatch(app);

    const res = await app.fetch(new Request(`${BASE}/batches/${batchId}`));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { batch: { id: string }; items: { id: string }[] };
    expect(body.batch).toMatchObject({ id: batchId, title: "Outbound emails" });
    expect(body.items.map((i) => i.id)).toEqual([`${batchId}:0`, `${batchId}:1`]);

    const missing = await app.fetch(new Request(`${BASE}/batches/nope`));
    expect(missing.status).toBe(404);
  });

  it("lists approvals, filterable by status", async () => {
    const { app } = setup();
    const id = await createRequest(app);

    const pendingRes = await app.fetch(new Request(`${BASE}/approvals?status=pending`));
    expect(pendingRes.status).toBe(200);
    const pendingBody = (await pendingRes.json()) as { approvals: { id: string }[] };
    expect(pendingBody.approvals.map((a) => a.id)).toEqual([id]);

    await post(app, "/callback", { pluginId: "a", requestId: id, decision: "approve" });

    const stillPending = await app.fetch(new Request(`${BASE}/approvals?status=pending`));
    expect(((await stillPending.json()) as { approvals: unknown[] }).approvals).toEqual([]);
  });

  it("returns a single approval for audit lookups", async () => {
    const { app } = setup();
    const id = await createRequest(app);

    const res = await app.fetch(new Request(`${BASE}/approvals/${id}`));
    expect(res.status).toBe(200);
    expect((await res.json()) as { id: string }).toMatchObject({ id });

    const missing = await app.fetch(new Request(`${BASE}/approvals/nope`));
    expect(missing.status).toBe(404);
  });
});

describe("inbox facade", () => {
  it("defaults the channel to the built-in web inbox when no plugins are given", async () => {
    const resolver = new FakeResolver();
    const app = createHitl({ resolver, store: new InMemoryStore() });
    expect(app.plugins.map((p) => p.id)).toEqual(["inbox"]);

    const id = await createRequest(app);
    const result = await app.inbox.approve(id);

    expect(result).toMatchObject({ type: "APPROVED", id });
    expect(resolver.resolved).toHaveLength(1);
  });

  it("always includes the web inbox channel alongside configured plugins", () => {
    const { app } = setup({ pluginIds: ["lead-approvals"] });
    // The configured channel stays first (the default); the inbox is appended.
    expect(app.plugins.map((p) => p.id)).toEqual(["lead-approvals", "inbox"]);
  });

  it("app.inbox.list matches the HTTP inbox", async () => {
    const { app } = setup();
    const id = await createRequest(app);

    const viaHttp = (
      (await (await app.fetch(new Request(`${BASE}/approvals?status=pending`))).json()) as {
        approvals: { id: string }[];
      }
    ).approvals.map((a) => a.id);
    const viaInbox = (await app.inbox.list({ status: "pending" })).map((a) => a.id);

    expect(viaInbox).toEqual(viaHttp);
    expect(viaInbox).toEqual([id]);
  });

  it("app.inbox.approve resolves the approval and resumes the engine", async () => {
    const { app, resolver } = setup();
    const id = await createRequest(app);

    const result = await app.inbox.approve(id, { by: { name: "u" } });

    expect(result).toMatchObject({ type: "APPROVED", id });
    expect(resolver.resolved).toEqual([{ token: "tok_1", payload: result }]);
    expect((await app.inbox.get(id))?.status).toBe("resolved");
  });
});

describe("inbox write routes", () => {
  it("POST /approvals/:id approves and resumes the engine", async () => {
    const { app, resolver } = setup();
    const id = await createRequest(app);

    const res = await post(app, `/approvals/${id}`, { decision: "approve", by: { name: "u" } });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, result: { type: "APPROVED", id, by: { name: "u" } } });
    expect(resolver.resolved).toHaveLength(1);
  });

  it("POST /approvals/:id denies with a reason", async () => {
    const { app } = setup();
    const id = await createRequest(app);

    const res = await post(app, `/approvals/${id}`, { decision: "deny", reason: "spam" });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { result: { type: string; reason?: string } };
    expect(body.result).toMatchObject({ type: "DENIED", reason: "spam" });
  });

  it("POST /batches/:batchId submits every item", async () => {
    const { app, resolver } = setup();
    const { batchId } = await createBatch(app);

    const res = await post(app, `/batches/${batchId}`, {
      decisions: [
        { requestId: `${batchId}:0`, decision: "approve" },
        { requestId: `${batchId}:1`, decision: "deny", reason: "no" },
      ],
      by: { name: "u" },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; results: { type: string }[] };
    expect(body.results.map((r) => r.type)).toEqual(["APPROVED", "DENIED"]);
    expect(resolver.resolved.map((r) => r.token)).toEqual(["tok_0", "tok_1"]);
  });

  it("maps an unknown id to 404 and invalid feedbacks to 400", async () => {
    const { app } = setup();

    const notFound = await post(app, "/approvals/missing", { decision: "approve" });
    expect(notFound.status).toBe(404);

    const id = await createRequest(app);
    const bad = await post(app, `/approvals/${id}`, {
      decision: "approve",
      feedbacks: { bogus: "x" },
    });
    expect(bad.status).toBe(400);
  });
});

describe("adapters", () => {
  it("routeHandlers delegate to fetch", async () => {
    const { app } = setup();
    const res = await app.routeHandlers.GET(new Request(`${BASE}/approvals`));
    expect(res.status).toBe(200);
  });

  it("the Node handler bridges req/res", async () => {
    const { app } = setup();

    const chunks: Buffer[] = [];
    let statusCode = 0;
    let ended = false;
    const req = Object.assign(
      (async function* () {})(), // empty body
      { method: "GET", url: "/.well-known/hitldev/v1/approvals", headers: { host: "x" } },
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
