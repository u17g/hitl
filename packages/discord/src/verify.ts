import { createPublicKey, verify as cryptoVerify } from "node:crypto";

/** Verify a Discord interaction request signature (Ed25519). */
export function verifyDiscordRequest(
  publicKeyHex: string,
  signatureHex: string,
  timestamp: string,
  body: string,
): boolean {
  try {
    const publicKey = createPublicKey({
      key: Buffer.concat([
        Buffer.from("302a300506032b6570032100", "hex"),
        Buffer.from(publicKeyHex, "hex"),
      ]),
      format: "der",
      type: "spki",
    });
    return cryptoVerify(
      null,
      Buffer.from(timestamp + body),
      { key: publicKey, dsaEncoding: "ieee-p1363" },
      Buffer.from(signatureHex, "hex"),
    );
  } catch {
    return false;
  }
}
