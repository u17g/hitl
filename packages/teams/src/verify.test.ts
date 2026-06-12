import { generateKeyPairSync, createSign, type KeyObject } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyTeamsRequest, setJwksForTests, clearJwksCache } from "./verify";

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

describe("verifyTeamsRequest", () => {
  it("accepts a valid Bot Framework JWT", async () => {
    const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    setJwksForTests(new Map([["test-kid", publicKey]]));

    const token = signJwt(privateKey, "test-kid", {
      aud: "app-123",
      iss: "https://api.botframework.com",
      exp: Math.floor(Date.now() / 1000) + 3600,
    });

    const ok = await verifyTeamsRequest({
      appId: "app-123",
      authorization: `Bearer ${token}`,
    });
    expect(ok).toBe(true);
    clearJwksCache();
  });

  it("rejects a token for a different audience", async () => {
    const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    setJwksForTests(new Map([["test-kid", publicKey]]));

    const token = signJwt(privateKey, "test-kid", {
      aud: "other-app",
      iss: "https://api.botframework.com",
      exp: Math.floor(Date.now() / 1000) + 3600,
    });

    const ok = await verifyTeamsRequest({
      appId: "app-123",
      authorization: `Bearer ${token}`,
    });
    expect(ok).toBe(false);
    clearJwksCache();
  });

  it("rejects missing authorization", async () => {
    expect(await verifyTeamsRequest({ appId: "app-123", authorization: null })).toBe(false);
  });
});
