import { describe, expect, it } from "vitest";
import { parseSlackCallback } from "./callback";

// Test list:
// - approve action -> decision "approve", requestId from the button value,
//   feedbacks extracted from state.values (text / select / radio)
// - deny action -> decision "deny", no feedbacks
// - reviewer mapped from the Slack user
// - returns an empty 200 ack response (Slack requires a fast ack)
// - returns null for: non-POST, wrong content type, no payload, non-block_actions,
//   actions without an openhitl action id

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
  actions: [{ action_id: "openhitl_approve", value: "req-1" }],
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
        actions: [{ action_id: "openhitl_deny", value: "req-1" }],
        state: { values: {} },
      }),
    );

    expect(callback).toMatchObject({ requestId: "req-1", decision: "deny" });
    expect(callback?.feedbacks).toBeUndefined();
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

  it("ignores interactivity payloads without an openhitl action", async () => {
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
