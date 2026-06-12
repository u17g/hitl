import { describe, expect, it } from "vitest";
import { verifyDiscordRequest } from "./verify";
import { createTestKeyPair, signDiscordRequest } from "./test-sign";

describe("verifyDiscordRequest", () => {
  it("accepts a valid signature", () => {
    const { publicKeyHex, privateKey } = createTestKeyPair();
    const timestamp = "1700000000";
    const body = '{"type":1}';
    const signature = signDiscordRequest(privateKey, timestamp, body);
    expect(verifyDiscordRequest(publicKeyHex, signature, timestamp, body)).toBe(true);
  });

  it("rejects a tampered body", () => {
    const { publicKeyHex, privateKey } = createTestKeyPair();
    const timestamp = "1700000000";
    const body = '{"type":1}';
    const signature = signDiscordRequest(privateKey, timestamp, body);
    expect(verifyDiscordRequest(publicKeyHex, signature, timestamp, '{"type":2}')).toBe(false);
  });
});
