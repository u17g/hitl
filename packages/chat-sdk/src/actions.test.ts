import { field, type HitlInbox } from "@hitldev/sdk";
import { describe, expect, it, vi } from "vitest";
import { ACTION_APPROVE, ACTION_DENY, MODAL_CALLBACK } from "./constants";
import { registerHitlHandlers } from "./actions";

// Test list:
// - deny click -> inbox.deny(requestId, { by })
// - approve click, no fields -> inbox.approve(requestId, { by }), no modal
// - approve click, with fields -> opens the modal, does not resolve yet
// - modal submit -> inbox.approve(requestId, { feedbacks, by }) from event.values
// - handlers register once per bot (idempotent)

const user = { userId: "u1", userName: "ryo", fullName: "Ryo", isBot: false, isMe: false };

function fakeBot() {
  const handlers: { action?: Function; modal?: Function } = {};
  const bot = {
    onAction: vi.fn((_ids: unknown, h: Function) => {
      handlers.action = h;
    }),
    onModalSubmit: vi.fn((_id: unknown, h: Function) => {
      handlers.modal = h;
    }),
  };
  return { bot, handlers };
}

function fakeInbox(record: unknown): HitlInbox {
  return {
    list: vi.fn(),
    get: vi.fn(async () => record),
    getBatch: vi.fn(),
    approve: vi.fn(async () => ({ type: "APPROVED", id: "req-1" })),
    deny: vi.fn(async () => ({ type: "DENIED", id: "req-1" })),
    submitBatch: vi.fn(),
  } as unknown as HitlInbox;
}

describe("registerHitlHandlers — action clicks", () => {
  it("denies on a deny click", async () => {
    const { bot, handlers } = fakeBot();
    const inbox = fakeInbox({ fields: {} });
    registerHitlHandlers(bot as never, () => inbox);

    await handlers.action?.({ actionId: ACTION_DENY, value: "req-1", user });

    expect(inbox.deny).toHaveBeenCalledWith("req-1", { by: { id: "u1", name: "Ryo" } });
    expect(inbox.approve).not.toHaveBeenCalled();
  });

  it("approves immediately when the approval has no fields", async () => {
    const { bot, handlers } = fakeBot();
    const inbox = fakeInbox({ fields: {} });
    registerHitlHandlers(bot as never, () => inbox);

    const openModal = vi.fn();
    await handlers.action?.({ actionId: ACTION_APPROVE, value: "req-1", user, openModal });

    expect(inbox.approve).toHaveBeenCalledWith("req-1", { by: { id: "u1", name: "Ryo" } });
    expect(openModal).not.toHaveBeenCalled();
  });

  it("opens the feedback modal when the approval has fields, without resolving", async () => {
    const { bot, handlers } = fakeBot();
    const inbox = fakeInbox({ fields: { subject: field.textField({ label: "Subject" }) } });
    registerHitlHandlers(bot as never, () => inbox);

    const openModal = vi.fn();
    await handlers.action?.({ actionId: ACTION_APPROVE, value: "req-1", user, openModal });

    expect(openModal).toHaveBeenCalledTimes(1);
    expect(inbox.approve).not.toHaveBeenCalled();
  });
});

describe("registerHitlHandlers — modal submit", () => {
  it("approves with feedbacks parsed from the submitted values", async () => {
    const { bot, handlers } = fakeBot();
    const inbox = fakeInbox({
      fields: { subject: field.textField({ label: "Subject" }), send: field.confirm({ label: "Send?" }) },
    });
    registerHitlHandlers(bot as never, () => inbox);

    await handlers.modal?.({
      callbackId: MODAL_CALLBACK,
      privateMetadata: JSON.stringify({ requestId: "req-1" }),
      values: { subject: "Hello", send: "no" },
      user,
    });

    expect(inbox.approve).toHaveBeenCalledWith("req-1", {
      feedbacks: { subject: "Hello", send: false },
      by: { id: "u1", name: "Ryo" },
    });
  });
});

describe("registerHitlHandlers — idempotency", () => {
  it("registers handlers only once per bot", () => {
    const { bot } = fakeBot();
    const inbox = fakeInbox({ fields: {} });
    registerHitlHandlers(bot as never, () => inbox);
    registerHitlHandlers(bot as never, () => inbox);

    expect(bot.onAction).toHaveBeenCalledTimes(1);
    expect(bot.onModalSubmit).toHaveBeenCalledTimes(1);
  });
});
