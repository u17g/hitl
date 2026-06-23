import { describe, expect, it, vi } from "vitest";
import { upstashWorkflowResolver } from "./resolver";

describe("upstashWorkflowResolver", () => {
  it("notifies the event identified by the token with the payload", async () => {
    const notify = vi.fn(async () => []);
    const client = { notify } as unknown as Parameters<
      typeof upstashWorkflowResolver
    >[0]["client"];
    const resolver = upstashWorkflowResolver({ client });

    const payload = {
      type: "RESOLVED" as const,
      actionId: "approve" as const,
      id: "a1",
      externalRef: "",
      feedbacks: {},
    };
    await resolver.resolve("run_1:hitl-wait-1", payload);

    expect(notify).toHaveBeenCalledWith({
      eventId: "run_1:hitl-wait-1",
      eventData: payload,
    });
  });
});
