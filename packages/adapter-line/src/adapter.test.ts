import { describe, expect, it, vi } from "vitest";
import { actions, type HumanRequest } from "@hitl-sdk/hitl/adapter";
import type { HitlInbox, HumanRequestRecord } from "@hitl-sdk/hitl/state";
import type { webhook } from "@line/bot-sdk";
import { createLineAdapter } from "./adapter";
import { LINE_FEEDBACK_PATH } from "./constants";
import { createLineFeedbackHandler, signFeedbackToken, verifyFeedbackToken } from "./feedback";
import { handlePostbackEvent } from "./postback";
import { handleLineWebhookEvents } from "./webhook";

const request: HumanRequest = {
  id: "req-1",
  channel: "line-approvals",
  message: "Deploy to production?",
  actions: actions().approve().deny().build(),
};

function testHumanRequestRecord(overrides: Partial<HumanRequestRecord> = {}): HumanRequestRecord {
  return {
    id: "req-1",
    token: "test-token",
    channel: "line-approvals",
    message: request.message,
    actions: request.actions,
    status: "pending",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function fakeClient() {
  const pushes: Array<{ to: string; messages: unknown[] }> = [];
  const client = {
    pushMessage: vi.fn(async (args: { to: string; messages: unknown[] }) => {
      pushes.push(args);
      return { sentMessages: [{ id: "msg-1" }] };
    }),
    replyMessage: vi.fn(async () => ({})),
    getProfile: vi.fn(async (userId: string) => ({ displayName: "Reviewer", userId })),
  };
  return { client, pushes };
}

function fakeInbox(opts?: { record?: HumanRequestRecord | null }): HitlInbox {
  const record = opts?.record ?? null;
  return {
    list: vi.fn<HitlInbox["list"]>(async () => ({ items: [] })),
    count: vi.fn<HitlInbox["count"]>(async () => 0),
    get: vi.fn<HitlInbox["get"]>(async () => record),
    getBatch: vi.fn<HitlInbox["getBatch"]>(async () => null),
    resolve: vi.fn<HitlInbox["resolve"]>(async () => ({
      type: "RESOLVED",
      id: "req-1",
      actionId: "approve",
      externalRef: "",
      feedbacks: {},
    })),
    resolveBatch: vi.fn<HitlInbox["resolveBatch"]>(async () => []),
  };
}

function testPostbackEvent(
  postback: webhook.PostbackEvent["postback"],
  source: webhook.PostbackEvent["source"],
): webhook.PostbackEvent {
  return {
    type: "postback",
    timestamp: 0,
    mode: "active",
    webhookEventId: "test-event",
    deliveryContext: { isRedelivery: false },
    postback,
    source,
  };
}

describe("createLineAdapter send", () => {
  it("posts flex approval card and returns external id", async () => {
    const { client, pushes } = fakeClient();
    const inbox = fakeInbox();
    const adapter = createLineAdapter({
      id: "line-approvals",
      client,
      defaultChannel: "user:U123",
      inbox: () => inbox,
    });

    const { externalId } = await adapter.send(request);
    expect(externalId).toBe("user:U123#msg-1");
    expect(pushes).toHaveLength(1);
    expect(pushes[0]?.to).toBe("U123");
    expect(pushes[0]?.messages[0]).toMatchObject({ type: "flex" });
  });

  it("throws when destination is missing", async () => {
    const { client } = fakeClient();
    const adapter = createLineAdapter({ id: "line-approvals", client, inbox: () => fakeInbox() });
    await expect(adapter.send({ ...request, destination: undefined })).rejects.toThrow(/defaultChannel/);
  });
});

describe("createLineAdapter update", () => {
  it("pushes outcome follow-up text", async () => {
    const { client, pushes } = fakeClient();
    const adapter = createLineAdapter({
      id: "line-approvals",
      client,
      defaultChannel: "user:U123",
      inbox: () => fakeInbox(),
    });
    const { externalId } = await adapter.send(request);
    await adapter.update!(externalId, {
      type: "RESOLVED",
      id: "req-1",
      actionId: "approve",
      externalRef: externalId,
      feedbacks: {},
    });
    expect(pushes).toHaveLength(2);
    expect(pushes[1]?.messages[0]).toEqual({
      type: "text",
      text: "Deploy to production?\n\nApproved",
    });
  });
});

describe("createLineAdapter notify", () => {
  it("posts a text notification", async () => {
    const { client, pushes } = fakeClient();
    const adapter = createLineAdapter({
      id: "line-approvals",
      client,
      defaultChannel: "user:U123",
      inbox: () => fakeInbox(),
    });
    const result = await adapter.notify({ message: "Reminder" });
    expect(result.externalId).toBe("user:U123#msg-1");
    expect(pushes[0]?.messages[0]).toEqual({ type: "text", text: "Reminder" });
  });
});

describe("postback handling", () => {
  it("resolves approve without fields", async () => {
    const { client } = fakeClient();
    const inbox = fakeInbox({ record: testHumanRequestRecord() });
    await handlePostbackEvent(
      testPostbackEvent(
        { data: JSON.stringify({ k: "a", r: "req-1", a: "approve" }) },
        { type: "user", userId: "U123" },
      ),
      { client, inbox },
    );
    expect(inbox.resolve).toHaveBeenCalledWith("req-1", {
      actionId: "approve",
      by: { id: "U123", name: "Reviewer" },
    });
  });
});

describe("feedback tokens", () => {
  it("signs and verifies feedback token", () => {
    const token = signFeedbackToken({
      requestId: "req-1",
      actionId: "approve",
      secret: "test-secret",
      ttlSeconds: 60,
    });
    expect(verifyFeedbackToken(token, "test-secret")).toMatchObject({
      requestId: "req-1",
      actionId: "approve",
    });
  });
});

describe("handleLineWebhookEvents", () => {
  it("processes hitl postbacks and skips others", async () => {
    const { client } = fakeClient();
    const inbox = fakeInbox({ record: testHumanRequestRecord() });
    await handleLineWebhookEvents(
      [
        testPostbackEvent(
          { data: JSON.stringify({ k: "a", r: "req-1", a: "approve" }) },
          { type: "user", userId: "U123" },
        ),
        testPostbackEvent({ data: "menu:settings" }, { type: "user", userId: "U123" }),
      ],
      { client, inbox },
    );
    expect(inbox.resolve).toHaveBeenCalledOnce();
  });

  it("delegates non-hitl events to onFallbackEvent", async () => {
    const { client } = fakeClient();
    const inbox = fakeInbox({ record: testHumanRequestRecord() });
    const fallbackEvents: webhook.Event[] = [];
    const customPostback = testPostbackEvent({ data: "menu:settings" }, { type: "user", userId: "U123" });
    const messageEvent = {
      type: "message",
      timestamp: 0,
      mode: "active",
      webhookEventId: "msg-event",
      deliveryContext: { isRedelivery: false },
      message: { type: "text", id: "m1", text: "hello" },
      source: { type: "user", userId: "U123" },
    } as webhook.MessageEvent;

    await handleLineWebhookEvents(
      [
        testPostbackEvent(
          { data: JSON.stringify({ k: "a", r: "req-1", a: "approve" }) },
          { type: "user", userId: "U123" },
        ),
        customPostback,
        messageEvent,
      ],
      {
        client,
        inbox,
        onFallbackEvent: (event) => {
          fallbackEvents.push(event);
        },
      },
    );

    expect(inbox.resolve).toHaveBeenCalledOnce();
    expect(fallbackEvents).toEqual([customPostback, messageEvent]);
  });
});

describe("createLineAdapter channel fetch", () => {
  it("registers fetch at the fixed LIFF feedback path when feedbackSecret is set", async () => {
    const inbox = fakeInbox({
      record: testHumanRequestRecord({
        actions: actions()
          .deny({ fields: { reason: { kind: "text", label: "Reason" } } })
          .build(),
      }),
    });
    const { client } = fakeClient();
    const adapter = createLineAdapter({
      id: "line-approvals",
      client,
      inbox: () => inbox,
      feedbackSecret: "secret",
      liffId: "liff-1",
    });

    expect(adapter.channelKey).toBe("line");
    expect(adapter.fetch).toBeDefined();

    const token = signFeedbackToken({
      requestId: "req-1",
      actionId: "deny",
      secret: "secret",
    });
    const getRes = await adapter.fetch!(
      new Request(`http://localhost${LINE_FEEDBACK_PATH}?token=${encodeURIComponent(token)}`),
    );
    expect(getRes.status).toBe(200);
    expect(await getRes.text()).toContain(LINE_FEEDBACK_PATH);

    const postRes = await adapter.fetch!(
      new Request(`http://localhost${LINE_FEEDBACK_PATH}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, feedbacks: { reason: "later" } }),
      }),
    );
    expect(postRes.status).toBe(200);
    expect(inbox.resolve).toHaveBeenCalledWith("req-1", {
      actionId: "deny",
      feedbacks: { reason: "later" },
    });
  });

  it("returns 404 for paths outside the feedback route", async () => {
    const { client } = fakeClient();
    const adapter = createLineAdapter({
      id: "line-approvals",
      client,
      inbox: () => fakeInbox(),
      feedbackSecret: "secret",
    });
    const res = await adapter.fetch!(new Request("http://localhost/.well-known/hitl/v1/channels/line/other"));
    expect(res.status).toBe(404);
  });
});

describe("createLineFeedbackHandler", () => {
  it("resolves request with validated feedbacks", async () => {
    const inbox = fakeInbox({
      record: testHumanRequestRecord({
        message: "x",
        actions: actions()
          .deny({ fields: { reason: { kind: "text", label: "Reason" } } })
          .build(),
      }),
    });
    const token = signFeedbackToken({
      requestId: "req-1",
      actionId: "deny",
      secret: "secret",
    });

    const handler = createLineFeedbackHandler({ inbox: () => inbox, secret: "secret" });
    const response = await handler(
      new Request("http://localhost/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, feedbacks: { reason: "bad timing" } }),
      }),
    );
    expect(response.status).toBe(200);
    expect(inbox.resolve).toHaveBeenCalledWith("req-1", {
      actionId: "deny",
      feedbacks: { reason: "bad timing" },
    });
  });
});
