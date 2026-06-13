import { describe, expect, it } from "vitest";
import type { HitlResolver } from "./binding";
import { Hitl } from "./hitl";
import { field } from "./fields";
import { InMemoryState } from "./state";
import type {
  ApprovalRequest,
  BatchApprovalRequest,
  HitlPlugin,
  Notification,
} from "./types";

// Test list:
// - POST {base}/requests creates an approval (201 { id }) and delivers it
// - the internal API is idempotent on the resume token
// - with a secret configured: missing/wrong bearer -> 401, correct bearer -> 201
// - POST {base}/requests/:id/timeout -> 200 { result }; unknown id -> 404
// - POST {base}/requests/:id/remind -> 200 { pending }
// - POST {base}/batches creates a batch (201 { batchId, ids })
// - POST {base}/batches/:id/timeout and /remind work like the approval ones
// - POST {base}/notifications routes a notify
// - malformed JSON on an internal route -> 400
// - POST with no matching internal route -> 404 (channel callbacks and inbox
//   paths are not served; resolve via hitl.inbox from your own handlers)
// - hitl.inbox reads/writes resolve approvals and resume the engine
// - routeHandlers.POST and the Node handler delegate to the same fetch logic

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
  };
}

function setup(opts?: { secret?: string; pluginIds?: string[] }) {
  const resolver = new FakeResolver();
  const plugins = (opts?.pluginIds ?? ["a", "b"]).map(jsonPlugin);
  const hitl = new Hitl({
    plugins,
    state: new InMemoryState(),
    resolver,
    secret: opts?.secret,
  });
  return { resolver, plugins, hitl };
}

function post(
  hitl: Hitl,
  path: string,
  body: unknown,
  headers?: Record<string, string>,
): Promise<Response> {
  return hitl.fetch(
    new Request(`${BASE}${path}`, {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body),
      headers,
    }),
  );
}

const fields = { subject: field.textField({ label: "Subject", default: "Hi" }) };

async function createRequest(hitl: Hitl, token = "tok_1") {
  const res = await post(hitl, "/requests", { token, message: "Approve?", fields });
  expect(res.status).toBe(201);
  return ((await res.json()) as { id: string }).id;
}

async function createBatch(hitl: Hitl) {
  const res = await post(hitl, "/batches", {
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
    const { hitl, plugins } = setup();

    const id = await createRequest(hitl);

    expect(plugins[0]!.sent).toHaveLength(1);
    expect(plugins[0]!.sent[0]).toMatchObject({ id, message: "Approve?" });
    const record = await hitl.state.get(id);
    expect(record).toMatchObject({ token: "tok_1", status: "pending" });
  });

  it("is idempotent on the resume token", async () => {
    const { hitl, plugins } = setup();

    const first = await createRequest(hitl);
    const second = await createRequest(hitl);

    expect(second).toBe(first);
    expect(plugins[0]!.sent).toHaveLength(1);
  });

  it("POST /requests/:id/timeout resolves a pending approval", async () => {
    const { hitl } = setup();
    const id = await createRequest(hitl);

    const res = await post(hitl, `/requests/${id}/timeout`, {});

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ result: { type: "TIMED_OUT", id } });
    expect((await hitl.state.get(id))?.status).toBe("resolved");
  });

  it("POST /requests/:id/timeout returns 404 for an unknown id", async () => {
    const { hitl } = setup();
    const res = await post(hitl, "/requests/missing/timeout", {});
    expect(res.status).toBe(404);
  });

  it("POST /requests/:id/remind sends a reminder while pending", async () => {
    const { hitl, plugins } = setup();
    const id = await createRequest(hitl);

    const res = await post(hitl, `/requests/${id}/remind`, {
      kind: "remind",
      message: "Still waiting",
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ pending: true });
    expect(plugins[0]!.notifications[0]).toMatchObject({ message: "Still waiting", parent: id });
  });

  it("returns 400 on malformed JSON", async () => {
    const { hitl } = setup();
    const res = await post(hitl, "/requests", "{nope");
    expect(res.status).toBe(400);
  });
});

describe("internal API: batches", () => {
  it("POST /batches creates and delivers a batch", async () => {
    const { hitl, plugins } = setup();

    const { batchId, ids } = await createBatch(hitl);

    expect(ids).toEqual([`${batchId}:0`, `${batchId}:1`]);
    expect(plugins[0]!.sentBatches).toHaveLength(1);
    expect((await hitl.state.listByBatch(batchId)).map((r) => r.token)).toEqual([
      "tok_0",
      "tok_1",
    ]);
  });

  it("POST /batches/:id/timeout resolves pending items", async () => {
    const { hitl } = setup();
    const { batchId } = await createBatch(hitl);

    const res = await post(hitl, `/batches/${batchId}/timeout`, {});

    expect(res.status).toBe(200);
    const { results } = (await res.json()) as { results: { type: string }[] };
    expect(results.map((r) => r.type)).toEqual(["TIMED_OUT", "TIMED_OUT"]);
  });

  it("POST /batches/:id/remind reports pending state", async () => {
    const { hitl, plugins } = setup();
    const { batchId } = await createBatch(hitl);

    const res = await post(hitl, `/batches/${batchId}/remind`, { kind: "remind" });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ pending: true });
    expect(plugins[0]!.notifications).toHaveLength(1);
  });
});

describe("internal API: notifications", () => {
  it("POST /notifications routes a notify", async () => {
    const { hitl, plugins } = setup();

    const res = await post(hitl, "/notifications", { message: "progress", channel: "b" });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(plugins[1]!.notifications).toEqual([{ message: "progress", channel: "b" }]);
  });
});

describe("internal API auth", () => {
  const auth = { authorization: "Bearer s3cret" };

  it("rejects a missing or wrong bearer with 401 when a secret is configured", async () => {
    const { hitl } = setup({ secret: "s3cret" });

    const missing = await post(hitl, "/requests", { token: "t", message: "m", fields: {} });
    expect(missing.status).toBe(401);

    const wrong = await post(
      hitl,
      "/requests",
      { token: "t", message: "m", fields: {} },
      { authorization: "Bearer nope" },
    );
    expect(wrong.status).toBe(401);
  });

  it("accepts the matching bearer", async () => {
    const { hitl } = setup({ secret: "s3cret" });
    const res = await post(hitl, "/requests", { token: "t", message: "m", fields: {} }, auth);
    expect(res.status).toBe(201);
  });
});

describe("non-internal routes are not served", () => {
  it("returns 404 for a POST that matches no internal route", async () => {
    const { hitl, resolver } = setup();
    await createRequest(hitl);

    const res = await post(hitl, "/callback", { requestId: "x", decision: "approve" });

    expect(res.status).toBe(404);
    expect(resolver.resolved).toHaveLength(0);
  });

  it("returns 404 for inbox-style resolve paths — use hitl.inbox instead", async () => {
    const { hitl, resolver } = setup();
    const id = await createRequest(hitl);

    const resolve = await post(hitl, `/approvals/${id}`, { decision: "approve" });
    expect(resolve.status).toBe(404);
    expect(resolver.resolved).toHaveLength(0);
  });

  it("returns 405 for inbox-style read paths", async () => {
    const { hitl } = setup();

    const list = await hitl.fetch(new Request(`${BASE}/approvals`));
    expect(list.status).toBe(405);

    const one = await hitl.fetch(new Request(`${BASE}/approvals/some-id`));
    expect(one.status).toBe(405);
  });
});

describe("inbox facade", () => {
  it("defaults the channel to the built-in web inbox when no plugins are given", async () => {
    const resolver = new FakeResolver();
    const hitl = new Hitl({ resolver, state: new InMemoryState() });
    expect(hitl.plugins.map((p) => p.id)).toEqual(["inbox"]);

    const id = await createRequest(hitl);
    const result = await hitl.inbox.approve(id);

    expect(result).toMatchObject({ type: "APPROVED", id });
    expect(resolver.resolved).toHaveLength(1);
  });

  it("always includes the web inbox channel alongside configured plugins", () => {
    const { hitl } = setup({ pluginIds: ["lead-approvals"] });
    expect(hitl.plugins.map((p) => p.id)).toEqual(["lead-approvals", "inbox"]);
  });

  it("lists approvals, filterable by status", async () => {
    const { hitl } = setup();
    const id = await createRequest(hitl);

    const pending = (await hitl.inbox.list({ status: "pending" })).map((a) => a.id);
    expect(pending).toEqual([id]);

    await hitl.inbox.approve(id);

    const stillPending = await hitl.inbox.list({ status: "pending" });
    expect(stillPending).toEqual([]);
  });

  it("returns a batch with its items", async () => {
    const { hitl } = setup();
    const { batchId } = await createBatch(hitl);

    const result = await hitl.inbox.getBatch(batchId);
    expect(result?.batch).toMatchObject({ id: batchId, title: "Outbound emails" });
    expect(result?.items.map((i) => i.id)).toEqual([`${batchId}:0`, `${batchId}:1`]);
    expect(await hitl.inbox.getBatch("nope")).toBeNull();
  });

  it("returns a single approval for lookups", async () => {
    const { hitl } = setup();
    const id = await createRequest(hitl);

    expect((await hitl.inbox.get(id))?.id).toBe(id);
    expect(await hitl.inbox.get("nope")).toBeNull();
  });

  it("hitl.inbox.approve resolves the approval and resumes the engine", async () => {
    const { hitl, resolver } = setup();
    const id = await createRequest(hitl);

    const result = await hitl.inbox.approve(id, { by: { name: "u" } });

    expect(result).toMatchObject({ type: "APPROVED", id });
    expect(resolver.resolved).toEqual([{ token: "tok_1", payload: result }]);
    expect((await hitl.inbox.get(id))?.status).toBe("resolved");
  });

  it("hitl.inbox.deny resolves with a reason", async () => {
    const { hitl } = setup();
    const id = await createRequest(hitl);

    const result = await hitl.inbox.deny(id, { reason: "spam" });

    expect(result).toMatchObject({ type: "DENIED", reason: "spam" });
  });

  it("hitl.inbox.submitBatch resolves every item", async () => {
    const { hitl, resolver } = setup();
    const { batchId } = await createBatch(hitl);

    const results = await hitl.inbox.submitBatch(
      batchId,
      [
        { requestId: `${batchId}:0`, decision: "approve" },
        { requestId: `${batchId}:1`, decision: "deny", reason: "no" },
      ],
      { by: { name: "u" } },
    );

    expect(results.map((r) => r.type)).toEqual(["APPROVED", "DENIED"]);
    expect(resolver.resolved.map((r) => r.token)).toEqual(["tok_0", "tok_1"]);
  });

  it("rejects invalid feedbacks", async () => {
    const { hitl } = setup();
    const id = await createRequest(hitl);

    await expect(
      hitl.inbox.approve(id, { feedbacks: { bogus: "x" } }),
    ).rejects.toThrow();
  });
});

describe("adapters", () => {
  it("routeHandlers delegate to fetch", async () => {
    const { hitl } = setup();
    const res = await hitl.routeHandlers.POST(
      new Request(`${BASE}/requests`, {
        method: "POST",
        body: JSON.stringify({ token: "t", message: "m", fields }),
        headers: { "content-type": "application/json" },
      }),
    );
    expect(res.status).toBe(201);
  });

  it("the Node handler bridges req/res", async () => {
    const { hitl } = setup();

    const chunks: Buffer[] = [];
    let statusCode = 0;
    let ended = false;
    const req = Object.assign(
      (async function* () {
        yield Buffer.from(
          JSON.stringify({ token: "t", message: "m", fields }),
        );
      })(),
      {
        method: "POST",
        url: "/.well-known/hitldev/v1/requests",
        headers: { host: "x", "content-type": "application/json" },
      },
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

    await hitl.handler(req as never, res as never);
    expect(statusCode).toBe(201);
    expect(ended).toBe(true);
    expect(JSON.parse(Buffer.concat(chunks).toString())).toHaveProperty("id");
  });
});
