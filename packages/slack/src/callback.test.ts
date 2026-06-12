import type { HitlCallback } from "@hitldev/sdk";
import { describe, expect, it } from "vitest";
import { parseSlackCallback } from "./callback";

// Test list:
// - approve action -> decision "approve", requestId from the button value,
//   feedbacks extracted from state.values (text / select / radio)
// - deny action -> decision "deny", no feedbacks
// - reviewer mapped from the Slack user
// - returns an empty 200 ack response (Slack requires a fast ack)
// - returns null for: non-POST, wrong content type, no payload, non-block_actions,
//   actions without an hitldev action id

function slackRequest(payload: unknown): Request {
  const body = new URLSearchParams({ payload: JSON.stringify(payload) });
  return new Request("http://x/hitl/callback", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
}

const approvePayload = {
  type: "block_actions",
  user: { id: "U1", username: "ryosuke" },
  actions: [{ action_id: "hitldev_approve", value: "req-1" }],
  state: {
    values: {
      "field:subject": { value: { type: "plain_text_input", value: "Edited" } },
      "field:priority": {
        value: { type: "static_select", selected_option: { value: "high" } },
      },
      "field:ccSales": {
        value: { type: "radio_buttons", selected_option: { value: "true" } },
      },
    },
  },
};

describe("parseSlackCallback", () => {
  it("parses an approve action with edited fields", async () => {
    const callback = await parseSlackCallback(slackRequest(approvePayload));

    expect(callback).toMatchObject({
      requestId: "req-1",
      decision: "approve",
      by: { id: "U1", name: "ryosuke" },
      feedbacks: { subject: "Edited", priority: "high", ccSales: "true" },
    });
    expect(callback?.response?.status).toBe(200);
  });

  it("parses a deny action without feedbacks", async () => {
    const callback = await parseSlackCallback(
      slackRequest({
        type: "block_actions",
        user: { id: "U1", username: "ryosuke" },
        actions: [{ action_id: "hitldev_deny", value: "req-1" }],
        state: { values: {} },
      }),
    );

    expect(callback).toMatchObject({ requestId: "req-1", decision: "deny" });
    expect((callback as HitlCallback).feedbacks).toBeUndefined();
  });

  it("ignores non-POST requests", async () => {
    expect(await parseSlackCallback(new Request("http://x/", { method: "GET" }))).toBeNull();
  });

  it("ignores non-form-encoded requests", async () => {
    const req = new Request("http://x/", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    expect(await parseSlackCallback(req)).toBeNull();
  });

  it("ignores form posts without a payload field", async () => {
    const req = new Request("http://x/", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ other: "x" }),
    });
    expect(await parseSlackCallback(req)).toBeNull();
  });

  it("parses a batch submit into per-item decisions", async () => {
    const callback = await parseSlackCallback(
      slackRequest({
        type: "block_actions",
        user: { id: "U1", username: "ryosuke" },
        actions: [{ action_id: "hitldev_batch_submit", value: "b1" }],
        state: {
          values: {
            "item:b1:0:decision": {
              value: { type: "radio_buttons", selected_option: { value: "approve" } },
            },
            "item:b1:0:field:subject": {
              value: { type: "plain_text_input", value: "Edited" },
            },
            "item:b1:1:decision": {
              value: { type: "radio_buttons", selected_option: { value: "deny" } },
            },
            "item:b1:1:field:subject": {
              value: { type: "plain_text_input", value: "Hi" },
            },
          },
        },
      }),
    );

    expect(callback).toMatchObject({
      batchId: "b1",
      by: { id: "U1", name: "ryosuke" },
    });
    const decisions = (callback as { decisions: unknown[] }).decisions;
    expect(decisions).toEqual(
      expect.arrayContaining([
        { requestId: "b1:0", decision: "approve", feedbacks: { subject: "Edited" } },
        { requestId: "b1:1", decision: "deny" },
      ]),
    );
    expect(decisions).toHaveLength(2);
    expect(callback?.response?.status).toBe(200);
  });

  it("treats items without a decision selection as approve", async () => {
    const callback = await parseSlackCallback(
      slackRequest({
        type: "block_actions",
        actions: [{ action_id: "hitldev_batch_submit", value: "b1" }],
        state: {
          values: {
            "item:b1:0:decision": { value: { type: "radio_buttons", selected_option: null } },
          },
        },
      }),
    );

    expect((callback as { decisions: unknown[] }).decisions).toEqual([
      { requestId: "b1:0", decision: "approve" },
    ]);
  });

  it("ignores interactivity payloads without an hitldev action", async () => {
    const callback = await parseSlackCallback(
      slackRequest({
        type: "block_actions",
        user: { id: "U1" },
        actions: [{ action_id: "some_other_button", value: "x" }],
      }),
    );
    expect(callback).toBeNull();
  });
});
