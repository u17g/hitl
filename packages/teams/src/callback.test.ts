import { generateKeyPairSync, createSign, type KeyObject } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { parseTeamsCallback } from "./callback";
import { setJwksForTests, clearJwksCache } from "./verify";

// Test list:
// - approve action -> decision "approve", requestId, feedbacks from field:* keys
// - deny action -> decision "deny", no feedbacks
// - reviewer mapped from from.aadObjectId / from.name
// - returns JSON 200 ack
// - returns null for non-POST, wrong content type, non-message activities
// - invalid JWT -> ackOnly 401

function base64Url(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input) : input;
  return buf.toString("base64url");
}

function signJwt(
  privateKey: KeyObject,
  kid: string,
  payload: Record<string, unknown>,
): string {
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT", kid }));
  const body = base64Url(JSON.stringify(payload));
  const signed = `${header}.${body}`;
  const sign = createSign("RSA-SHA256");
  sign.update(signed);
  sign.end();
  const signature = sign.sign(privateKey);
  return `${signed}.${base64Url(signature)}`;
}

function authHeader(privateKey: KeyObject, appId: string): string {
  const token = signJwt(privateKey, "test-kid", {
    aud: appId,
    iss: "https://api.botframework.com",
    exp: Math.floor(Date.now() / 1000) + 3600,
  });
  return `Bearer ${token}`;
}

function teamsRequest(
  activity: unknown,
  authorization: string,
): Request {
  return new Request("http://x/hitl/callback", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization,
    },
    body: JSON.stringify(activity),
  });
}

const APP_ID = "app-123";
const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });

beforeEach(() => {
  clearJwksCache();
  setJwksForTests(new Map([["test-kid", publicKey]]));
});

const approveActivity = {
  type: "message",
  from: { id: "29:u1", name: "ryosuke", aadObjectId: "aad-1" },
  value: {
    hitldev_action: "approve",
    requestId: "req-1",
    "field:subject": "Edited",
    "field:priority": "high",
    "field:ccSales": "true",
  },
};

describe("parseTeamsCallback", () => {
  it("parses an approve action with edited fields", async () => {
    const callback = await parseTeamsCallback(teamsRequest(approveActivity, authHeader(privateKey, APP_ID)), {
      appId: APP_ID,
    });

    expect(callback).toMatchObject({
      requestId: "req-1",
      decision: "approve",
      by: { id: "aad-1", name: "ryosuke" },
      feedbacks: { subject: "Edited", priority: "high", ccSales: "true" },
    });
    expect(callback?.response?.status).toBe(200);
  });

  it("parses a deny action without feedbacks", async () => {
    const callback = await parseTeamsCallback(
      teamsRequest(
        {
          type: "message",
          from: { aadObjectId: "aad-1", name: "ryosuke" },
          value: { hitldev_action: "deny", requestId: "req-1" },
        },
        authHeader(privateKey, APP_ID),
      ),
      { appId: APP_ID },
    );

    expect(callback).toMatchObject({ requestId: "req-1", decision: "deny" });
    expect(callback?.feedbacks).toBeUndefined();
  });

  it("rejects invalid JWT with ackOnly 401", async () => {
    const callback = await parseTeamsCallback(
      teamsRequest(approveActivity, "Bearer invalid.token.here"),
      { appId: APP_ID },
    );

    expect(callback?.ackOnly).toBe(true);
    expect(callback?.response?.status).toBe(401);
  });

  it("ignores non-POST requests", async () => {
    expect(
      await parseTeamsCallback(new Request("http://x/", { method: "GET" }), { appId: APP_ID }),
    ).toBeNull();
  });

  it("ignores non-json requests", async () => {
    const req = new Request("http://x/", {
      method: "POST",
      headers: { "content-type": "text/plain", authorization: authHeader(privateKey, APP_ID) },
      body: "x",
    });
    expect(await parseTeamsCallback(req, { appId: APP_ID })).toBeNull();
  });

  it("ignores non-message activities", async () => {
    const callback = await parseTeamsCallback(
      teamsRequest({ type: "conversationUpdate" }, authHeader(privateKey, APP_ID)),
      { appId: APP_ID },
    );
    expect(callback).toBeNull();
  });

  it("ignores activities without hitldev actions", async () => {
    const callback = await parseTeamsCallback(
      teamsRequest(
        { type: "message", value: { other: "x" } },
        authHeader(privateKey, APP_ID),
      ),
      { appId: APP_ID },
    );
    expect(callback).toBeNull();
  });
});
