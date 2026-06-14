import { describe, expect, it, vi } from "vitest";
import { HITL_RESUME_SIGNAL } from "./constants";
import { temporalResolver } from "./resolver";

describe("temporalResolver", () => {
  it("signals the workflow with waitToken and payload", async () => {
    const signal = vi.fn(async () => {});
    const getHandle = vi.fn(() => ({ signal }));
    const client = {
      workflow: { getHandle },
    } as unknown as Parameters<typeof temporalResolver>[0]["client"];
    const resolver = temporalResolver({ client });

    const payload = {
      type: "RESOLVED" as const,
      actionId: "approve" as const,
      id: "a1",
      externalRef: "",
      feedbacks: {},
    };
    const token = JSON.stringify({ workflowId: "wf-123", waitToken: "hitl-wait-1" });
    await resolver.resolve(token, payload);

    expect(getHandle).toHaveBeenCalledWith("wf-123");
    expect(signal).toHaveBeenCalledWith(HITL_RESUME_SIGNAL, {
      waitToken: "hitl-wait-1",
      payload,
    });
  });

  it("throws on an invalid token", async () => {
    const client = {
      workflow: { getHandle: vi.fn() },
    } as unknown as Parameters<typeof temporalResolver>[0]["client"];
    const resolver = temporalResolver({ client });

    await expect(resolver.resolve("not-json", {})).rejects.toThrow();
  });
});
