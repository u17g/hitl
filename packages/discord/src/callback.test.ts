import { hitl } from "@hitldev/sdk";
import { describe, expect, it } from "vitest";
import { parseDiscordCallback, RESPONSE_MODAL } from "./callback";
import {
  approveCustomId,
  denyCustomId,
  modalCustomId,
  MODAL_PREFIX,
} from "./render";
import { createTestKeyPair, signedDiscordRequest } from "./test-sign";

describe("parseDiscordCallback", () => {
  const { publicKeyHex, privateKey } = createTestKeyPair();
  const pendingFields = new Map([
    [
      "req-1",
      { subject: hitl.textField({ label: "Subject", default: "Hi" }) },
    ],
  ]);

  function parse(body: unknown) {
    return parseDiscordCallback(signedDiscordRequest(privateKey, body), {
      publicKey: publicKeyHex,
      pendingFields,
    });
  }

  it("returns null for non-JSON requests", async () => {
    const res = await parseDiscordCallback(
      new Request("http://x", { method: "GET" }),
      { publicKey: publicKeyHex, pendingFields },
    );
    expect(res).toBeNull();
  });

  it("rejects invalid signatures", async () => {
    const callback = await parseDiscordCallback(
      new Request("http://x/discord/interactions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-signature-ed25519": "00".repeat(64),
          "x-signature-timestamp": "1700000000",
        },
        body: '{"type":1}',
      }),
      { publicKey: publicKeyHex, pendingFields },
    );
    expect(callback?.ackOnly).toBe(true);
    expect(callback?.response?.status).toBe(401);
  });

  it("pongs ping interactions", async () => {
    const callback = await parse({ type: 1 });
    expect(callback).toMatchObject({ ackOnly: true });
    expect(await callback!.response!.json()).toEqual({ type: 1 });
  });

  it("parses deny button clicks", async () => {
    const callback = await parse({
      type: 3,
      data: { custom_id: denyCustomId("req-1") },
      user: { id: "u1", username: "alice" },
    });
    expect(callback).toMatchObject({
      requestId: "req-1",
      decision: "deny",
      by: { id: "u1", name: "alice" },
    });
    expect(await callback!.response!.json()).toEqual({ type: 6 });
  });

  it("approves immediately when no fields are pending", async () => {
    const callback = await parse({
      type: 3,
      data: { custom_id: approveCustomId("req-2") },
      user: { id: "u1", username: "alice" },
    });
    expect(callback).toMatchObject({
      requestId: "req-2",
      decision: "approve",
    });
  });

  it("opens a modal when approve is clicked with fields", async () => {
    const callback = await parse({
      type: 3,
      data: { custom_id: approveCustomId("req-1") },
      user: { id: "u1", username: "alice" },
    });
    expect(callback?.ackOnly).toBe(true);
    const body = (await callback!.response!.json()) as {
      type: number;
      data: { custom_id: string };
    };
    expect(body.type).toBe(RESPONSE_MODAL);
    expect(body.data.custom_id).toBe(`${MODAL_PREFIX}req-1`);
    expect(body.data.custom_id).toBe(modalCustomId("req-1"));
  });

  it("parses modal submit with feedbacks", async () => {
    const callback = await parse({
      type: 5,
      data: {
        custom_id: modalCustomId("req-1"),
        components: [
          {
            components: [{ custom_id: "field:subject", value: "Updated subject" }],
          },
        ],
      },
      user: { id: "u1", username: "alice" },
    });
    expect(callback).toMatchObject({
      requestId: "req-1",
      decision: "approve",
      feedbacks: { subject: "Updated subject" },
      by: { id: "u1", name: "alice" },
    });
  });
});
