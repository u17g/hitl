import { field, actions, type HumanRequest } from "@hitl-sdk/hitl/adapter";
import type { HitlInbox } from "@hitl-sdk/hitl/state";
import { toCardElement } from "chat";
import { describe, expect, it, vi } from "vitest";
import { createChatSdkAdapter } from "./index";

// Test list:
// - send posts the approval card to the channel and returns "<channel>#<id>"
// - update edits the stored handle with the result card (outcome shown)
// - update on an unknown externalId is a no-op (handle lost after restart)
// - notify posts to the channel root, or threads under threadRef
// - constructing the plugin registers the bot handlers

const request: HumanRequest = {
  id: "req-1",
  channel: "approvals",
  message: "Inbound lead: a@b.com",
  actions: actions()
    .approve({ fields: { subject: field.textField({ label: "Subject" }) } })
    .build(),
};

function fakeBot() {
  const posted: { kind: string; ref: string; msg: unknown }[] = [];
  const handles: { id: string; edit: ReturnType<typeof vi.fn> }[] = [];
  const target = (kind: string, ref: string) => ({
    post: vi.fn(async (msg: unknown) => {
      posted.push({ kind, ref, msg });
      const handle = { id: "msg-1", edit: vi.fn(async () => {}) };
      handles.push(handle);
      return handle;
    }),
  });
  const bot = {
    channel: vi.fn((ref: string) => target("channel", ref)),
    thread: vi.fn((ref: string) => target("thread", ref)),
    onAction: vi.fn(),
    onModalSubmit: vi.fn(),
  };
  return { bot, posted, handles };
}

const inbox = {} as HitlInbox;

function makePlugin(bot: ReturnType<typeof fakeBot>["bot"]) {
  return createChatSdkAdapter({ id: "approvals", bot: bot as never, channel: "slack:C123", inbox: () => inbox });
}

describe("createChatSdkAdapter send", () => {
  it("posts the approval card and returns channel#id as externalId", async () => {
    const { bot, posted } = fakeBot();
    const { externalId } = await makePlugin(bot).send(request);

    expect(externalId).toBe("slack:C123#msg-1");
    expect(bot.channel).toHaveBeenCalledWith("slack:C123");
    expect(posted[0]?.kind).toBe("channel");
    expect(toCardElement(posted[0]?.msg)?.type).toBe("card");
  });

  it("posts in thread when threadRef is set", async () => {
    const { bot, posted } = fakeBot();
    await makePlugin(bot).send({ ...request, threadRef: "slack:C123#ts-1" });

    expect(bot.thread).toHaveBeenCalledWith("slack:C123:ts-1");
    expect(posted[0]?.kind).toBe("thread");
  });

  it("accepts a Chat SDK thread ref directly", async () => {
    const { bot, posted } = fakeBot();
    await makePlugin(bot).send({ ...request, threadRef: "slack:C123:ts-1" });

    expect(bot.thread).toHaveBeenCalledWith("slack:C123:ts-1");
    expect(posted[0]?.kind).toBe("thread");
  });
});

describe("createChatSdkAdapter update", () => {
  it("edits the stored message handle with the result card", async () => {
    const { bot, handles } = fakeBot();
    const plugin = makePlugin(bot);
    const { externalId } = await plugin.send(request);

    await plugin.update?.(externalId, {
      type: "RESOLVED",
      actionId: "approve",
      id: "req-1",
      by: { name: "Ryo" },
      feedbacks: {},
    });

    expect(handles[0]?.edit).toHaveBeenCalledTimes(1);
    const edited = handles[0]?.edit.mock.calls[0]?.[0];
    expect(JSON.stringify(toCardElement(edited))).toContain("Approved by Ryo");
  });

  it("is a no-op when the externalId has no live handle", async () => {
    const { bot, handles } = fakeBot();
    const plugin = makePlugin(bot);

    await expect(
      plugin.update?.("slack:C123#gone", { type: "RESOLVED", actionId: "approve", id: "x", feedbacks: {} }),
    ).resolves.toBeUndefined();
    expect(handles).toHaveLength(0);
  });
});

describe("createChatSdkAdapter notify", () => {
  it("posts to the channel root when there is no parent", async () => {
    const { bot, posted } = fakeBot();
    const result = await makePlugin(bot).notify({ message: "Still waiting" });

    expect(bot.channel).toHaveBeenCalledWith("slack:C123");
    expect(posted[0]).toMatchObject({ kind: "channel", msg: "Still waiting" });
    expect(result.externalId).toBe("slack:C123#msg-1");
  });

  it("threads under the parent message when threadRef is set", async () => {
    const { bot, posted } = fakeBot();
    const result = await makePlugin(bot).notify({ message: "Reminder", threadRef: "slack:C123#ts-1" });

    expect(bot.thread).toHaveBeenCalledWith("slack:C123:ts-1");
    expect(posted[0]).toMatchObject({ kind: "thread", msg: "Reminder" });
    expect(result.externalId).toBe("slack:C123#msg-1");
  });
});

describe("createChatSdkAdapter wiring", () => {
  it("registers approve/deny and modal handlers on the bot", () => {
    const { bot } = fakeBot();
    makePlugin(bot);
    expect(bot.onAction).toHaveBeenCalledTimes(1);
    expect(bot.onModalSubmit).toHaveBeenCalledTimes(1);
  });
});
