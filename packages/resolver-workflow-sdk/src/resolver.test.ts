import { describe, expect, it, vi } from "vitest";
import { workflowResolver } from "./resolver";

const { resumeHookMock } = vi.hoisted(() => ({ resumeHookMock: vi.fn() }));

vi.mock("workflow/api", () => ({ resumeHook: resumeHookMock }));

describe("workflowResolver", () => {
  it("delegates resolve to WDK resumeHook", async () => {
    const resolver = workflowResolver();

    const payload = {
      type: "RESOLVED" as const,
      actionId: "submit" as const,
      id: "a1",
      feedbacks: {},
    };
    await resolver.resolve("hook_token", payload);

    expect(resumeHookMock).toHaveBeenCalledWith("hook_token", payload);
  });
});
