import { actions, type HitlRequest } from "hitl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { workflowHitl } from "./index";

// Test list:
// - suspend() is a WDK hook: the hook token goes to POST /requests in the body
// - the API URL comes from getWorkflowMetadata().url; HITL_URL / options.url override it
// - the secret is sent as a bearer; sleep maps ms -> WDK "Nms" strings
// - timeout: sleeps, then returns the /timeout endpoint's result
// - the user-provided `request` step is the only transport (no stdlib fetch)

const hooks = vi.hoisted(() => {
  let counter = 0;
  return {
    reset() {
      counter = 0;
    },
    create<T>() {
      counter += 1;
      return { token: `hook_${counter}`, then: () => {} } as unknown as PromiseLike<T> & {
        token: string;
      };
    },
  };
});

const { sleepMock, metadataMock } = vi.hoisted(() => ({
  sleepMock: vi.fn(async (_duration: string) => {}),
  metadataMock: vi.fn(() => ({ url: "https://my-app.vercel.app" })),
}));

vi.mock("workflow", () => ({
  createHook: <T,>() => hooks.create<T>(),
  sleep: sleepMock,
  getWorkflowMetadata: metadataMock,
}));

/** A fake "use step" request function backed by an array of canned JSON bodies. */
function fakeRequest(bodies: unknown[]) {
  const calls: HitlRequest[] = [];
  let i = 0;
  const request = vi.fn(async (req: HitlRequest) => {
    calls.push(req);
    return { status: 200, ok: true, body: JSON.stringify(bodies[i++]) };
  });
  return { request, calls };
}

beforeEach(() => {
  hooks.reset();
  sleepMock.mockClear();
  delete process.env.HITL_URL;
  delete process.env.HITL_SECRET;
});

describe("workflowHitl", () => {
  it("POSTs the hook token to /requests at the deployment url with the bearer", async () => {
    const { request, calls } = fakeRequest([{ id: "a1" }]);
    const hitl = workflowHitl({ request, secret: "s3cret" });

    void hitl.waitForHuman({ message: "Approve?", actions: actions().approve().build() });
    await vi.waitFor(() => expect(calls).toHaveLength(1));

    expect(calls[0]!.url).toBe("https://my-app.vercel.app/.well-known/hitl/v1/requests");
    expect(calls[0]!.headers.authorization).toBe("Bearer s3cret");
    expect(JSON.parse(calls[0]!.body)).toMatchObject({ token: "hook_1", message: "Approve?" });
  });

  it("prefers HITL_URL, then an explicit url option", async () => {
    process.env.HITL_URL = "http://localhost:3000";
    const a = fakeRequest([{ id: "a1" }]);
    void workflowHitl({ request: a.request }).waitForHuman({
      message: "m",
      actions: actions().approve().build(),
    });
    await vi.waitFor(() => expect(a.calls).toHaveLength(1));
    expect(a.calls[0]!.url).toBe("http://localhost:3000/.well-known/hitl/v1/requests");

    const b = fakeRequest([{ id: "a1" }]);
    void workflowHitl({ request: b.request, url: "https://override.example" }).waitForHuman({
      message: "m",
      actions: actions().approve().build(),
    });
    await vi.waitFor(() => expect(b.calls).toHaveLength(1));
    expect(b.calls[0]!.url).toBe("https://override.example/.well-known/hitl/v1/requests");
  });

  it("times out via WDK sleep and the /timeout endpoint", async () => {
    const { request, calls } = fakeRequest([
      { id: "a1" },
      { result: { type: "TIMED_OUT", id: "a1" } },
    ]);
    const hitl = workflowHitl({ request });

    const result = await hitl.waitForHuman({
      message: "m",
      actions: actions().approve().build(),
      timeout: "1h",
    });

    expect(sleepMock).toHaveBeenCalledWith("3600000ms");
    expect(result).toEqual({ type: "TIMED_OUT", id: "a1" });
    expect(calls[1]!.url).toBe(
      "https://my-app.vercel.app/.well-known/hitl/v1/requests/a1/timeout",
    );
  });
});
