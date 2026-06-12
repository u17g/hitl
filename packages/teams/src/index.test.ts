import { field, type ApprovalRequest } from "@hitldev/sdk";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { clearTokenCache } from "./auth";
import { teamsHitl } from "./index";
import { setJwksForTests, clearJwksCache } from "./verify";
import { generateKeyPairSync, createSign, type KeyObject } from "node:crypto";

// Test list:
// - send acquires token, creates channel conversation, posts Adaptive Card activity;
//   returns externalId "conversationId:activityId"
// - send with preconfigured conversationId skips createConversation
// - update PUTs the activity with the result card
// - notify posts a message; parentExternalId replies in-thread
// - handleCallback parses Bot Framework activity posts

interface TeamsCall {
  url: string;
  method: string;
  auth: string | null;
  body: Record<string, unknown> | null;
}

function base64Url(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input) : input;
  return buf.toString("base64url");
}

function signJwt(privateKey: KeyObject, kid: string, payload: Record<string, unknown>): string {
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT", kid }));
  const body = base64Url(JSON.stringify(payload));
  const signed = `${header}.${body}`;
  const sign = createSign("RSA-SHA256");
  sign.update(signed);
  sign.end();
  return `${signed}.${base64Url(sign.sign(privateKey))}`;
}

const APP_ID = "app-123";
const APP_PASSWORD = "secret";
const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });

function fakeTeams() {
  const calls: TeamsCall[] = [];
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input, init);
    const text = await req.text();
    let body: Record<string, unknown> | null = null;
    if (text && (req.headers.get("content-type") ?? "").includes("application/json")) {
      body = JSON.parse(text) as Record<string, unknown>;
    }
    calls.push({
      url: req.url,
      method: req.method,
      auth: req.headers.get("authorization"),
      body,
    });

    if (req.url.includes("login.microsoftonline.com")) {
      return new Response(JSON.stringify({ access_token: "token-abc", expires_in: 3600 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    if (req.url.endsWith("/v3/conversations") && req.method === "POST") {
      return new Response(JSON.stringify({ id: "conv-1", serviceUrl: "https://smba.test/teams/" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    if (req.url.includes("/activities") && req.method === "POST") {
      return new Response(JSON.stringify({ id: "act-1" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    if (req.url.includes("/activities/") && req.method === "PUT") {
      return new Response(JSON.stringify({ id: "act-1" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });

  return { calls, fetchImpl };
}

const request: ApprovalRequest = {
  id: "req-1",
  channel: "lead-approvals",
  message: "Inbound lead: a@b.com",
  fields: { subject: field.textField({ label: "Subject", default: "Hi" }) },
};

beforeEach(() => {
  clearTokenCache();
  clearJwksCache();
  setJwksForTests(new Map([["test-kid", publicKey]]));
});

describe("teamsHitl send", () => {
  it("creates a channel conversation and posts an Adaptive Card", async () => {
    const { calls, fetchImpl } = fakeTeams();
    const plugin = teamsHitl({
      id: "lead-approvals",
      target: { type: "channel", teamId: "team-1", channelId: "chan-1" },
      appId: APP_ID,
      appPassword: APP_PASSWORD,
      tenantId: "tenant-1",
      fetch: fetchImpl,
    });

    const { externalId } = await plugin.send(request);

    expect(externalId).toBe("conv-1:act-1");
    expect(calls[0]?.url).toContain("login.microsoftonline.com");
    expect(calls[1]).toMatchObject({
      url: "https://smba.trafficmanager.net/teams/v3/conversations",
      method: "POST",
      auth: "Bearer token-abc",
    });
    expect(calls[1]?.body).toMatchObject({
      channelData: {
        channel: { id: "chan-1" },
        team: { id: "team-1" },
        tenant: { id: "tenant-1" },
      },
    });
    expect(calls[2]?.url).toContain("/v3/conversations/conv-1/activities");
    expect(JSON.stringify(calls[2]?.body)).toContain("AdaptiveCard");
  });

  it("skips createConversation when conversationId is configured", async () => {
    const { calls, fetchImpl } = fakeTeams();
    const plugin = teamsHitl({
      id: "lead-approvals",
      target: {
        type: "channel",
        conversationId: "conv-existing",
        serviceUrl: "https://smba.test/teams/",
      },
      appId: APP_ID,
      appPassword: APP_PASSWORD,
      fetch: fetchImpl,
    });

    const { externalId } = await plugin.send(request);

    expect(externalId).toBe("conv-existing:act-1");
    expect(calls.some((c) => c.url.endsWith("/v3/conversations") && c.method === "POST")).toBe(false);
    expect(calls.some((c) => c.url.includes("/conv-existing/activities"))).toBe(true);
  });
});

describe("teamsHitl update", () => {
  it("updates the activity with the outcome card", async () => {
    const { calls, fetchImpl } = fakeTeams();
    const plugin = teamsHitl({
      id: "lead-approvals",
      target: { type: "channel", conversationId: "conv-1", serviceUrl: "https://smba.test/teams/" },
      appId: APP_ID,
      appPassword: APP_PASSWORD,
      fetch: fetchImpl,
    });

    const { externalId } = await plugin.send(request);
    await plugin.update!(externalId, {
      type: "APPROVED",
      id: "req-1",
      by: { name: "ryosuke" },
    });

    const updateCall = calls.find((c) => c.method === "PUT");
    expect(updateCall?.url).toContain("/v3/conversations/conv-1/activities/act-1");
    expect(JSON.stringify(updateCall?.body)).toContain("Approved by ryosuke");
  });
});

describe("teamsHitl batch", () => {
  const batchRequest = {
    batchId: "b1",
    channel: "lead-approvals",
    title: "Outbound emails",
    fields: { subject: field.textField({ label: "Subject", default: "Hi" }) },
    items: [
      { id: "b1:0", message: "Email to ACME", defaults: { subject: "Hello ACME" } },
      { id: "b1:1", message: "Email to Globex", defaults: { subject: "Hi" } },
    ],
  };

  function makePlugin(fetchImpl: typeof fetch) {
    return teamsHitl({
      id: "lead-approvals",
      target: { type: "channel", conversationId: "conv-1", serviceUrl: "https://smba.test/teams/" },
      appId: APP_ID,
      appPassword: APP_PASSWORD,
      fetch: fetchImpl,
    });
  }

  it("sendBatch posts the batch as one Adaptive Card", async () => {
    const { calls, fetchImpl } = fakeTeams();
    const plugin = makePlugin(fetchImpl);

    const { externalId } = await plugin.sendBatch!(batchRequest);

    expect(externalId).toBe("conv-1:act-1");
    const postCall = calls.find((c) => c.method === "POST" && c.url.includes("/activities"));
    const json = JSON.stringify(postCall?.body);
    expect(json).toContain("Email to ACME");
    expect(json).toContain("batch_submit");
  });

  it("updateBatch replaces the card with per-item outcomes", async () => {
    const { calls, fetchImpl } = fakeTeams();
    const plugin = makePlugin(fetchImpl);

    const { externalId } = await plugin.sendBatch!(batchRequest);
    await plugin.updateBatch!(externalId, [
      { type: "APPROVED", id: "b1:0", by: { name: "ryosuke" } },
      { type: "DENIED", id: "b1:1", reason: "spam" },
    ]);

    const updateCall = calls.find((c) => c.method === "PUT");
    expect(updateCall?.url).toContain("/v3/conversations/conv-1/activities/act-1");
    const json = JSON.stringify(updateCall?.body);
    expect(json).toContain("Approved by ryosuke");
    expect(json).toContain("spam");
  });

  it("canSendBatch rejects cards over the size limit", () => {
    const { fetchImpl } = fakeTeams();
    const plugin = makePlugin(fetchImpl);

    expect(plugin.canSendBatch!(batchRequest)).toBe(true);

    const big = {
      ...batchRequest,
      items: Array.from({ length: 200 }, (_, i) => ({
        id: `b1:${i}`,
        message: `Item ${i}: ${"x".repeat(200)}`,
        defaults: {},
      })),
    };
    expect(plugin.canSendBatch!(big)).toBe(false);
  });
});

describe("teamsHitl notify", () => {
  it("posts a plain message", async () => {
    const { calls, fetchImpl } = fakeTeams();
    const plugin = teamsHitl({
      id: "lead-approvals",
      target: { type: "channel", conversationId: "conv-1", serviceUrl: "https://smba.test/teams/" },
      appId: APP_ID,
      appPassword: APP_PASSWORD,
      fetch: fetchImpl,
    });

    await plugin.notify({ message: "progress update" });

    const postCall = calls.find((c) => c.method === "POST" && c.url.includes("/activities"));
    expect(postCall?.body).toMatchObject({ type: "message", text: "progress update" });
  });

  it("replies in-thread under the parent approval message", async () => {
    const { calls, fetchImpl } = fakeTeams();
    const plugin = teamsHitl({
      id: "lead-approvals",
      target: { type: "channel", conversationId: "conv-1", serviceUrl: "https://smba.test/teams/" },
      appId: APP_ID,
      appPassword: APP_PASSWORD,
      fetch: fetchImpl,
    });

    await plugin.notify({
      message: "Original message: hello",
      parent: "req-1",
      parentExternalId: "conv-1:act-1",
    });

    const replyCall = calls.find((c) => c.method === "POST" && c.url.includes("/activities"));
    expect(replyCall?.body).toMatchObject({
      type: "message",
      text: "Original message: hello",
      replyToId: "act-1",
    });
  });
});

describe("teamsHitl handleCallback", () => {
  it("parses Bot Framework activity posts", async () => {
    const { fetchImpl } = fakeTeams();
    const plugin = teamsHitl({
      id: "lead-approvals",
      target: { type: "channel", conversationId: "conv-1" },
      appId: APP_ID,
      appPassword: APP_PASSWORD,
      fetch: fetchImpl,
    });

    const token = signJwt(privateKey, "test-kid", {
      aud: APP_ID,
      iss: "https://api.botframework.com",
      exp: Math.floor(Date.now() / 1000) + 3600,
    });

    const callback = await plugin.handleCallback!(
      new Request("http://x/hitl/callback", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          type: "message",
          from: { aadObjectId: "aad-1", name: "ryosuke" },
          value: {
            hitldev_action: "approve",
            requestId: "req-1",
            "field:subject": "Edited",
          },
        }),
      }),
    );

    expect(callback).toMatchObject({
      requestId: "req-1",
      decision: "approve",
      feedbacks: { subject: "Edited" },
    });
  });
});
