import { actions } from "@hitl-sdk/hitl";
import type { HitlRequest } from "@hitl-sdk/hitl/core";
import type { WorkflowContext } from "@upstash/workflow";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createUpstashWorkflowHitlClient } from "./index";

// Test list:
// - suspend() registers waitForEvent; the token (runId:hitl-wait-N) goes in POST /requests body
// - waitForEvent is keyed by the same globally-unique event id (stepId === eventId === token)
// - url comes from HITL_URL or options.url; secret sent as bearer
// - timeout: context.sleep (ms -> seconds), then returns the /timeout endpoint's result
// - default request uses incrementing hitl-fetch-N context.run IDs

const { sleepMock, waitForEventMock, runMock } = vi.hoisted(() => ({
  // waitForEvent stays pending by default; the human-response path is exercised via the resolver.
  sleepMock: vi.fn(async (_id: string, _duration: number | string) => {}),
  waitForEventMock: vi.fn((_id: string, _eventId: string, _opts: unknown) => new Promise(() => {})),
  runMock: vi.fn(async (_id: string, fn: () => Promise<unknown>) => fn()),
}));

function createContext(runId = "run_1"): WorkflowContext {
  return {
    workflowRunId: runId,
    sleep: sleepMock,
    waitForEvent: waitForEventMock,
    run: runMock,
  } as unknown as WorkflowContext;
}

/** A fake context.run request function backed by an array of canned JSON bodies. */
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
  sleepMock.mockClear();
  waitForEventMock.mockClear();
  runMock.mockClear();
  waitForEventMock.mockImplementation(() => new Promise(() => {}));
  runMock.mockImplementation(async (_id: string, fn: () => Promise<unknown>) => fn());
  delete process.env.HITL_URL;
  delete process.env.HITL_SECRET;
});

describe("createUpstashWorkflowHitlClient", () => {
  it("POSTs a run-scoped wait token to /requests and registers waitForEvent on it", async () => {
    const { request, calls } = fakeRequest([{ id: "a1" }]);
    const context = createContext("run_1");
    const hitl = createUpstashWorkflowHitlClient({
      context,
      request,
      url: "https://my-app.example",
      secret: "s3cret",
    });

    void hitl.waitForHuman({ message: "Approve?", actions: actions().approve().build() });
    await vi.waitFor(() => expect(calls).toHaveLength(1));

    expect(calls[0]!.url).toBe("https://my-app.example/.well-known/hitl/v1/requests");
    expect(calls[0]!.headers.authorization).toBe("Bearer s3cret");
    expect(JSON.parse(calls[0]!.body)).toMatchObject({
      token: "run_1:hitl-wait-1",
      message: "Approve?",
    });
    // stepId and eventId are the same globally-unique token.
    expect(waitForEventMock).toHaveBeenCalledWith(
      "run_1:hitl-wait-1",
      "run_1:hitl-wait-1",
      expect.objectContaining({ timeout: expect.any(String) }),
    );
  });

  it("prefers HITL_URL, then an explicit url option", async () => {
    process.env.HITL_URL = "http://localhost:3000";
    const a = fakeRequest([{ id: "a1" }]);
    void createUpstashWorkflowHitlClient({ context: createContext(), request: a.request }).waitForHuman({
      message: "m",
      actions: actions().approve().build(),
    });
    await vi.waitFor(() => expect(a.calls).toHaveLength(1));
    expect(a.calls[0]!.url).toBe("http://localhost:3000/.well-known/hitl/v1/requests");

    const b = fakeRequest([{ id: "a1" }]);
    void createUpstashWorkflowHitlClient({
      context: createContext(),
      request: b.request,
      url: "https://override.example",
    }).waitForHuman({ message: "m", actions: actions().approve().build() });
    await vi.waitFor(() => expect(b.calls).toHaveLength(1));
    expect(b.calls[0]!.url).toBe("https://override.example/.well-known/hitl/v1/requests");
  });

  it("times out via context.sleep (ms -> seconds) and the /timeout endpoint", async () => {
    const { request, calls } = fakeRequest([
      { id: "a1" },
      { result: { type: "TIMED_OUT", id: "a1", externalRef: "" } },
    ]);
    const hitl = createUpstashWorkflowHitlClient({
      context: createContext(),
      request,
      url: "https://my-app.example",
    });

    const result = await hitl.waitForHuman({
      message: "m",
      actions: actions().approve().build(),
      timeout: "1h",
    });

    expect(sleepMock).toHaveBeenCalledWith("hitl-timer-1", 3600);
    expect(result).toEqual({ type: "TIMED_OUT", id: "a1", externalRef: "" });
    expect(calls[1]!.url).toBe(
      "https://my-app.example/.well-known/hitl/v1/requests/a1/timeout",
    );
  });

  it("uses incrementing hitl-fetch-N context.run IDs for the default request", async () => {
    const fetchMock = vi.fn(async () => ({
      status: 200,
      ok: true,
      text: async () => JSON.stringify({ id: "a1" }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const context = createContext();
    const hitl = createUpstashWorkflowHitlClient({ context, url: "https://my-app.example" });

    void hitl.waitForHuman({ message: "m", actions: actions().approve().build() });
    await vi.waitFor(() => expect(runMock).toHaveBeenCalledTimes(1));

    expect(runMock.mock.calls[0]![0]).toBe("hitl-fetch-1");

    vi.unstubAllGlobals();
  });
});
