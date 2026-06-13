import { describe, expect, it, vi } from "vitest";
import { workflowResolver } from "./resolver";

const { resumeHookMock } = vi.hoisted(() => ({ resumeHookMock: vi.fn() }));

vi.mock("workflow/api", () => ({ resumeHook: resumeHookMock }));

describe("workflowResolver", () => {
  it("delegates resolve to WDK resumeHook", async () => {
    const resolver = workflowResolver();

    await resolver.resolve("hook_token", { type: "APPROVED", id: "a1" });

    expect(resumeHookMock).toHaveBeenCalledWith("hook_token", { type: "APPROVED", id: "a1" });
  });
});
