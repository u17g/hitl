import {
  field,
  type ApprovalRequest,
  type BatchApprovalRequest,
  type HitlBatchCallback,
} from "@hitldev/sdk";
import { describe, expect, it, vi } from "vitest";
import { discordHitl } from "./index";
import {
  approveCustomId,
  batchSelectCustomId,
  batchSubmitCustomId,
  denyCustomId,
} from "./render";
import { createTestKeyPair, signedDiscordRequest } from "./test-sign";

interface DiscordCall {
  method: string;
  url: string;
  auth: string | null;
  body: Record<string, unknown>;
}

function fakeDiscord(responses: Record<string, unknown>[] = []) {
  const calls: DiscordCall[] = [];
  let i = 0;
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input, init);
    const method = init?.method ?? "GET";
    calls.push({
      method,
      url: req.url,
      auth: req.headers.get("authorization"),
      body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {},
    });
    const body = responses[i++] ?? { id: "msg-1", channel_id: "chan-1" };
    return new Response(JSON.stringify(body), {
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

function makePlugin(fetchImpl: typeof fetch, publicKeyHex?: string) {
  return discordHitl({
    id: "lead-approvals",
    channelId: "chan-1",
    token: "bot-test",
    publicKey: publicKeyHex,
    fetch: fetchImpl,
  });
}

describe("discordHitl send", () => {
  it("posts an embed message with approve/deny buttons", async () => {
    const { calls, fetchImpl } = fakeDiscord();
    const plugin = makePlugin(fetchImpl);
    const { externalId } = await plugin.send(request);

    expect(externalId).toBe("chan-1:msg-1");
    expect(calls[0]).toMatchObject({
      method: "POST",
      url: "https://discord.com/api/v10/channels/chan-1/messages",
      auth: "Bot bot-test",
    });
    expect(calls[0]?.body.embeds).toEqual([{ description: request.message }]);
    const buttons = (
      calls[0]?.body.components as { components: { custom_id: string }[] }[]
    )[0]?.components;
    expect(buttons?.map((b) => b.custom_id)).toEqual([
      approveCustomId("req-1"),
      denyCustomId("req-1"),
    ]);
  });
});

describe("discordHitl update", () => {
  it("patches the message with the outcome embed", async () => {
    const { calls, fetchImpl } = fakeDiscord([{ id: "msg-1", channel_id: "chan-1" }, {}]);
    const plugin = makePlugin(fetchImpl);
    const { externalId } = await plugin.send(request);
    await plugin.update!(externalId, { type: "APPROVED", id: "req-1", by: { name: "alice" } });

    expect(calls[1]).toMatchObject({
      method: "PATCH",
      url: "https://discord.com/api/v10/channels/chan-1/messages/msg-1",
    });
    expect(calls[1]?.body.components).toEqual([]);
    expect(
      (calls[1]?.body.embeds as { footer: { text: string } }[])[0]?.footer.text,
    ).toBe("Approved by alice");
  });
});

describe("discordHitl notify", () => {
  it("posts a channel message", async () => {
    const { calls, fetchImpl } = fakeDiscord();
    const plugin = makePlugin(fetchImpl);
    await plugin.notify({ message: "Still working..." });

    expect(calls[0]?.body).toMatchObject({ content: "Still working..." });
  });

  it("threads under parentExternalId via message_reference", async () => {
    const { calls, fetchImpl } = fakeDiscord();
    const plugin = makePlugin(fetchImpl);
    await plugin.notify({
      message: "Update",
      parentExternalId: "chan-1:msg-99",
    });

    expect(calls[0]?.body).toMatchObject({
      content: "Update",
      message_reference: { message_id: "msg-99" },
    });
  });
});

const batchRequest: BatchApprovalRequest = {
  batchId: "b1",
  channel: "lead-approvals",
  title: "Outbound emails",
  fields: {},
  items: [
    { id: "b1:0", message: "Email to ACME", defaults: {} },
    { id: "b1:1", message: "Email to Globex", defaults: {} },
  ],
};

describe("discordHitl batch", () => {
  it("canSendBatch accepts field-less batches up to 25 items", () => {
    const { fetchImpl } = fakeDiscord();
    const plugin = makePlugin(fetchImpl);

    expect(plugin.canSendBatch!(batchRequest)).toBe(true);
    expect(
      plugin.canSendBatch!({
        ...batchRequest,
        fields: { subject: field.textField({ label: "Subject" }) },
      }),
    ).toBe(false);
    expect(
      plugin.canSendBatch!({
        ...batchRequest,
        items: Array.from({ length: 26 }, (_, i) => ({
          id: `b1:${i}`,
          message: `Item ${i}`,
          defaults: {},
        })),
      }),
    ).toBe(false);
  });

  it("sendBatch posts the batch as one message", async () => {
    const { calls, fetchImpl } = fakeDiscord();
    const plugin = makePlugin(fetchImpl);

    const { externalId } = await plugin.sendBatch!(batchRequest);

    expect(externalId).toBe("chan-1:msg-1");
    const json = JSON.stringify(calls[0]?.body);
    expect(json).toContain("Email to ACME");
    expect(json).toContain(batchSelectCustomId("b1"));
    expect(json).toContain(batchSubmitCustomId("b1"));
  });

  it("updateBatch patches the message with per-item outcomes", async () => {
    const { calls, fetchImpl } = fakeDiscord([{ id: "msg-1", channel_id: "chan-1" }, {}]);
    const plugin = makePlugin(fetchImpl);

    const { externalId } = await plugin.sendBatch!(batchRequest);
    await plugin.updateBatch!(externalId, [
      { type: "APPROVED", id: "b1:0", by: { name: "alice" } },
      { type: "DENIED", id: "b1:1", reason: "spam" },
    ]);

    expect(calls[1]).toMatchObject({
      method: "PATCH",
      url: "https://discord.com/api/v10/channels/chan-1/messages/msg-1",
    });
    expect(calls[1]?.body.components).toEqual([]);
    const json = JSON.stringify(calls[1]?.body.embeds);
    expect(json).toContain("Approved by alice");
    expect(json).toContain("spam");
  });

  it("handleCallback runs the select-then-submit flow", async () => {
    const { fetchImpl } = fakeDiscord();
    const { publicKeyHex, privateKey } = createTestKeyPair();
    const plugin = makePlugin(fetchImpl, publicKeyHex);
    await plugin.sendBatch!(batchRequest);

    const select = await plugin.handleCallback!(
      signedDiscordRequest(privateKey, {
        type: 3,
        data: { custom_id: batchSelectCustomId("b1"), values: ["b1:1"] },
      }),
    );
    expect(select?.ackOnly).toBe(true);

    const submit = await plugin.handleCallback!(
      signedDiscordRequest(privateKey, {
        type: 3,
        data: { custom_id: batchSubmitCustomId("b1") },
        user: { id: "u1", username: "alice" },
      }),
    );
    expect((submit as HitlBatchCallback).decisions).toEqual([
      { requestId: "b1:0", decision: "deny" },
      { requestId: "b1:1", decision: "approve" },
    ]);
  });
});

describe("discordHitl handleCallback", () => {
  it("delegates to parseDiscordCallback with stored pending fields", async () => {
    const { fetchImpl } = fakeDiscord();
    const { publicKeyHex, privateKey } = createTestKeyPair();
    const plugin = makePlugin(fetchImpl, publicKeyHex);
    await plugin.send(request);

    const callback = await plugin.handleCallback!(
      signedDiscordRequest(privateKey, {
        type: 3,
        data: { custom_id: approveCustomId("req-1") },
        user: { id: "u1", username: "alice" },
      }),
    );

    expect(callback?.ackOnly).toBe(true);
    const body = (await callback!.response!.json()) as { type: number };
    expect(body.type).toBe(9);
  });
});
