import { beforeEach, describe, expect, it, vi } from "vitest";

// Test list (thin: the binding only delegates to WDK primitives):
// - suspend() creates a hook and exposes its token; the promise settles with the hook payload
// - resolve() delegates to resumeHook(token, payload)
// - sleep() converts milliseconds to a WDK duration string
// - run() passes the function through (WDK workflow code may perform IO directly)

const { createHook, wdkSleep, resumeHook } = vi.hoisted(() => ({
  createHook: vi.fn(),
  wdkSleep: vi.fn(),
  resumeHook: vi.fn(),
}));

vi.mock("workflow", () => ({ createHook, sleep: wdkSleep }));
vi.mock("workflow/api", () => ({ resumeHook }));

import { vercelWorkflowBinding } from "./index";

const binding = vercelWorkflowBinding();

beforeEach(() => {
  vi.clearAllMocks();
});

describe("vercelWorkflowBinding", () => {
  it("suspend creates a hook and resolves with its payload", async () => {
    const hook = {
      token: "hook-token-1",
      then: (onFulfilled: (value: unknown) => unknown) =>
        Promise.resolve({ type: "APPROVED" }).then(onFulfilled),
    };
    createHook.mockReturnValue(hook);

    const suspension = binding.suspend<{ type: string }>();

    expect(createHook).toHaveBeenCalledOnce();
    expect(suspension.token).toBe("hook-token-1");
    await expect(suspension.promise).resolves.toEqual({ type: "APPROVED" });
  });

  it("resolve delegates to resumeHook", async () => {
    resumeHook.mockResolvedValue({ runId: "r1" });

    await binding.resolve("hook-token-1", { type: "DENIED" });

    expect(resumeHook).toHaveBeenCalledWith("hook-token-1", { type: "DENIED" });
  });

  it("sleep delegates with a millisecond duration string", async () => {
    wdkSleep.mockResolvedValue(undefined);

    await binding.sleep(5000);

    expect(wdkSleep).toHaveBeenCalledWith("5000ms");
  });

  it("run passes the function through", async () => {
    await expect(binding.run("openhitl:deliver", async () => 42)).resolves.toBe(42);
  });
});
