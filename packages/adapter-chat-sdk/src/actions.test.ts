import { field, humanActions, type HitlInbox } from "hitl";
import { describe, expect, it, vi } from "vitest";
import { actionButtonId, actionModalCallback } from "./constants";
import { registerHitlHandlers } from "./actions";

const user = { userId: "u1", userName: "ryo", fullName: "Ryo", isBot: false, isMe: false };

function fakeBot() {
  const handlers: { action?: Function; modal?: Function } = {};
  const bot = {
    onAction: vi.fn((handler: Function) => {
      handlers.action = handler;
    }),
    onModalSubmit: vi.fn((handler: Function) => {
      handlers.modal = handler;
    }),
  };
  return { bot, handlers };
}

function fakeInbox(record: unknown): HitlInbox {
  return {
    list: vi.fn(),
    get: vi.fn(async () => record),
    getBatch: vi.fn(),
    resolve: vi.fn(async () => ({ type: "RESOLVED", actionId: "submit", id: "req-1", feedbacks: {} })),
    resolveBatch: vi.fn(),
    submitBatch: vi.fn(),
  } as unknown as HitlInbox;
}

describe("registerHitlHandlers — action clicks", () => {
  it("resolves deny on a deny click when deny has no fields", async () => {
    const { bot, handlers } = fakeBot();
    const inbox = fakeInbox({ actions: humanActions().submit().deny().build() });
    registerHitlHandlers(bot as never, () => inbox);

    await handlers.action?.({ actionId: actionButtonId("deny"), value: "req-1", user });

    expect(inbox.resolve).toHaveBeenCalledWith("req-1", {
      actionId: "deny",
      by: { id: "u1", name: "Ryo" },
    });
  });

  it("opens the deny modal when deny has fields", async () => {
    const { bot, handlers } = fakeBot();
    const inbox = fakeInbox({
      actions: humanActions()
        .submit()
        .deny({ fields: { reason: field.textArea({ label: "Reason" }) } })
        .build(),
    });
    registerHitlHandlers(bot as never, () => inbox);

    const openModal = vi.fn();
    await handlers.action?.({ actionId: actionButtonId("deny"), value: "req-1", user, openModal });

    expect(openModal).toHaveBeenCalledTimes(1);
    expect(inbox.resolve).not.toHaveBeenCalled();
  });

  it("resolves immediately when submit has no fields", async () => {
    const { bot, handlers } = fakeBot();
    const inbox = fakeInbox({ actions: humanActions().submit().build() });
    registerHitlHandlers(bot as never, () => inbox);

    const openModal = vi.fn();
    await handlers.action?.({ actionId: actionButtonId("submit"), value: "req-1", user, openModal });

    expect(inbox.resolve).toHaveBeenCalledWith("req-1", {
      actionId: "submit",
      by: { id: "u1", name: "Ryo" },
    });
    expect(openModal).not.toHaveBeenCalled();
  });

  it("opens the submit modal when submit has fields, without resolving", async () => {
    const { bot, handlers } = fakeBot();
    const inbox = fakeInbox({
      actions: humanActions()
        .submit({ fields: { subject: field.textField({ label: "Subject" }) } })
        .build(),
    });
    registerHitlHandlers(bot as never, () => inbox);

    const openModal = vi.fn();
    await handlers.action?.({ actionId: actionButtonId("submit"), value: "req-1", user, openModal });

    expect(openModal).toHaveBeenCalledTimes(1);
    expect(inbox.resolve).not.toHaveBeenCalled();
  });
});

describe("registerHitlHandlers — modal submit", () => {
  it("resolves with feedbacks parsed from the submitted values", async () => {
    const { bot, handlers } = fakeBot();
    const inbox = fakeInbox({
      actions: humanActions()
        .submit({
          fields: {
            subject: field.textField({ label: "Subject" }),
            send: field.confirm({ label: "Send?" }),
          },
        })
        .build(),
    });
    registerHitlHandlers(bot as never, () => inbox);

    await handlers.modal?.({
      callbackId: actionModalCallback("submit"),
      privateMetadata: JSON.stringify({ requestId: "req-1", actionId: "submit" }),
      values: { subject: "Hello", send: "no" },
      user,
    });

    expect(inbox.resolve).toHaveBeenCalledWith("req-1", {
      actionId: "submit",
      feedbacks: { subject: "Hello", send: false },
      by: { id: "u1", name: "Ryo" },
    });
  });

  it("resolves with feedbacks from the deny modal", async () => {
    const { bot, handlers } = fakeBot();
    const inbox = fakeInbox({
      actions: humanActions()
        .submit()
        .deny({ fields: { reason: field.textArea({ label: "Reason" }) } })
        .build(),
    });
    registerHitlHandlers(bot as never, () => inbox);

    await handlers.modal?.({
      callbackId: actionModalCallback("deny"),
      privateMetadata: JSON.stringify({ requestId: "req-1", actionId: "deny" }),
      values: { reason: "Not now" },
      user,
    });

    expect(inbox.resolve).toHaveBeenCalledWith("req-1", {
      actionId: "deny",
      feedbacks: { reason: "Not now" },
      by: { id: "u1", name: "Ryo" },
    });
  });
});

describe("registerHitlHandlers — idempotency", () => {
  it("registers handlers only once per bot", () => {
    const { bot } = fakeBot();
    const inbox = fakeInbox({ actions: humanActions().submit().build() });
    registerHitlHandlers(bot as never, () => inbox);
    registerHitlHandlers(bot as never, () => inbox);

    expect(bot.onAction).toHaveBeenCalledTimes(1);
    expect(bot.onModalSubmit).toHaveBeenCalledTimes(1);
  });
});
