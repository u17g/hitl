import { describe, expect, it, vi } from "vitest";
import { HITL_RESUME_EVENT } from "./constants";
import { inngestResolver } from "./resolver";

describe("inngestResolver", () => {
  it("sends a resume event with token and payload", async () => {
    const send = vi.fn(async () => ({ ids: ["evt_1"] }));
    const client = { send } as unknown as Parameters<typeof inngestResolver>[0]["client"];
    const resolver = inngestResolver({ client });

    const payload = {
      type: "RESOLVED" as const,
      actionId: "approve" as const,
      id: "a1",
      feedbacks: {},
    };
    await resolver.resolve("hitl-wait-1", payload);

    expect(send).toHaveBeenCalledWith({
      name: HITL_RESUME_EVENT,
      data: { token: "hitl-wait-1", payload },
    });
  });

  it("uses a custom event name when provided", async () => {
    const send = vi.fn(async () => ({ ids: ["evt_1"] }));
    const client = { send } as unknown as Parameters<typeof inngestResolver>[0]["client"];
    const resolver = inngestResolver({ client, event: "custom/resume" });

    await resolver.resolve("tok", { type: "TIMED_OUT", id: "a1" });

    expect(send).toHaveBeenCalledWith({
      name: "custom/resume",
      data: { token: "tok", payload: { type: "TIMED_OUT", id: "a1" } },
    });
  });
});
