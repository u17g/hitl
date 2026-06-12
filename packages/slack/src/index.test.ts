import { hitl, type ApprovalRequest } from "@hitldev/sdk";
import { describe, expect, it, vi } from "vitest";
import { slackHitl } from "./index";

// Test list:
// - send calls chat.postMessage with bearer auth, channel, fallback text, and blocks;
//   returns externalId "<channel>:<ts>"
// - send throws when Slack responds ok: false
// - update calls chat.update with the channel/ts from the externalId and result blocks
//   that include the original message text
// - notify posts a message; parentExternalId threads it via thread_ts
// - handleCallback parses Slack interactivity posts

interface SlackCall {
  url: string;
  auth: string | null;
  body: Record<string, unknown>;
}

function fakeSlack(responses: Record<string, unknown>[] = []) {
  const calls: SlackCall[] = [];
  let i = 0;
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input, init);
    calls.push({
      url: req.url,
      auth: req.headers.get("authorization"),
      body: JSON.parse(await req.text()) as Record<string, unknown>,
    });
    const body = responses[i++] ?? { ok: true, ts: "111.222", channel: "C1" };
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
  fields: { subject: hitl.textField({ label: "Subject", default: "Hi" }) },
};

function makePlugin(fetchImpl: typeof fetch) {
  return slackHitl({
    id: "lead-approvals",
    channel: "#inbound-leads",
    token: "xoxb-test",
    fetch: fetchImpl,
  });
}

describe("slackHitl send", () => {
  it("posts the approval message and returns channel:ts as externalId", async () => {
    const { calls, fetchImpl } = fakeSlack();
    const plugin = makePlugin(fetchImpl);

    const { externalId } = await plugin.send(request);

    expect(externalId).toBe("C1:111.222");
    expect(calls[0]).toMatchObject({
      url: "https://slack.com/api/chat.postMessage",
      auth: "Bearer xoxb-test",
    });
    expect(calls[0]!.body).toMatchObject({
      channel: "#inbound-leads",
      text: "Inbound lead: a@b.com",
    });
    expect(Array.isArray(calls[0]!.body.blocks)).toBe(true);
  });

  it("throws when Slack responds with an error", async () => {
    const { fetchImpl } = fakeSlack([{ ok: false, error: "channel_not_found" }]);
    const plugin = makePlugin(fetchImpl);

    await expect(plugin.send(request)).rejects.toThrow(/channel_not_found/);
  });
});

describe("slackHitl update", () => {
  it("replaces the message with the outcome via chat.update", async () => {
    const { calls, fetchImpl } = fakeSlack();
    const plugin = makePlugin(fetchImpl);

    const { externalId } = await plugin.send(request);
    await plugin.update!(externalId, {
      type: "APPROVED",
      id: "req-1",
      by: { name: "ryosuke" },
    });

    expect(calls[1]).toMatchObject({ url: "https://slack.com/api/chat.update" });
    expect(calls[1]!.body).toMatchObject({ channel: "C1", ts: "111.222" });
    const blocksJson = JSON.stringify(calls[1]!.body.blocks);
    expect(blocksJson).toContain("Inbound lead: a@b.com");
    expect(blocksJson).toContain("Approved by ryosuke");
  });
});

describe("slackHitl notify", () => {
  it("posts a plain message", async () => {
    const { calls, fetchImpl } = fakeSlack();
    const plugin = makePlugin(fetchImpl);

    await plugin.notify({ message: "progress update" });

    expect(calls[0]!.body).toMatchObject({
      channel: "#inbound-leads",
      text: "progress update",
    });
    expect(calls[0]!.body.thread_ts).toBeUndefined();
  });

  it("threads under the parent approval message", async () => {
    const { calls, fetchImpl } = fakeSlack();
    const plugin = makePlugin(fetchImpl);

    await plugin.notify({
      message: "Original message: hello",
      parent: "req-1",
      parentExternalId: "C1:111.222",
    });

    expect(calls[0]!.body).toMatchObject({ channel: "C1", thread_ts: "111.222" });
  });
});

describe("slackHitl handleCallback", () => {
  it("parses Slack interactivity posts", async () => {
    const { fetchImpl } = fakeSlack();
    const plugin = makePlugin(fetchImpl);

    const payload = {
      type: "block_actions",
      user: { id: "U1", username: "ryosuke" },
      actions: [{ action_id: "hitldev_approve", value: "req-1" }],
      state: {
        values: {
          "field:subject": { value: { type: "plain_text_input", value: "Edited" } },
        },
      },
    };
    const callback = await plugin.handleCallback!(
      new Request("http://x/hitl/callback", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ payload: JSON.stringify(payload) }),
      }),
    );

    expect(callback).toMatchObject({
      requestId: "req-1",
      decision: "approve",
      feedbacks: { subject: "Edited" },
    });
  });
});
