import { generateKeyPairSync, sign, type KeyObject } from "node:crypto";

export interface TestKeyPair {
  publicKeyHex: string;
  privateKey: KeyObject;
}

export function createTestKeyPair(): TestKeyPair {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const pubDer = publicKey.export({ type: "spki", format: "der" });
  return {
    publicKeyHex: pubDer.subarray(pubDer.length - 32).toString("hex"),
    privateKey,
  };
}

export function signDiscordRequest(
  privateKey: KeyObject,
  timestamp: string,
  body: string,
): string {
  return sign(null, Buffer.from(timestamp + body), {
    key: privateKey,
    dsaEncoding: "ieee-p1363",
  }).toString("hex");
}

export function signedDiscordRequest(
  privateKey: KeyObject,
  body: unknown,
  timestamp = "1234567890",
): Request {
  const text = JSON.stringify(body);
  const signature = signDiscordRequest(privateKey, timestamp, text);
  return new Request("http://x/discord/interactions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-signature-ed25519": signature,
      "x-signature-timestamp": timestamp,
    },
    body: text,
  });
}
