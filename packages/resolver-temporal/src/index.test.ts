import { actions } from "@hitl-sdk/hitl";
import type { HitlRequest } from "@hitl-sdk/hitl/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTemporalHitlClient } from "./index";

// Test list:
// - suspend() registers condition wait and POSTs encoded token to /requests
// - url comes from HITL_URL or options.url; secret sent as bearer
// - timeout: sleep, then returns the /timeout endpoint's result
// - the user-provided `request` activity is the only transport

const { conditionMock, setHandlerMock, sleepMock, workflowInfoMock } = vi.hoisted(() => ({
  conditionMock: vi.fn(async (predicate: () => boolean) => {
    if (predicate()) return;
    return new Promise<void>(() => {});
  }),
  setHandlerMock: vi.fn(),
  sleepMock: vi.fn(async (_ms: number) => {}),
  workflowInfoMock: vi.fn(() => ({ workflowId: "wf-123" })),
}));

vi.mock("@temporalio/workflow", () => ({
  condition: conditionMock,
  setHandler: setHandlerMock,
  sleep: sleepMock,
  workflowInfo: workflowInfoMock,
}));

vi.mock("./signals", () => ({
  hitlResumeSignal: "hitl-resume-signal",
}));

/** A fake activity-backed request function backed by an array of canned JSON bodies. */
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
  conditionMock.mockClear();
  setHandlerMock.mockClear();
  sleepMock.mockClear();
  workflowInfoMock.mockClear();
  workflowInfoMock.mockReturnValue({ workflowId: "wf-123" });
  conditionMock.mockImplementation(async (predicate: () => boolean) => {
    if (predicate()) return;
    return new Promise<void>(() => {});
  });
  delete process.env.HITL_URL;
  delete process.env.HITL_SECRET;
});

describe("createTemporalHitlClient", () => {
  it("POSTs the encoded wait token to /requests and registers setHandler", async () => {
    const { request, calls } = fakeRequest([{ id: "a1" }]);
    const hitl = createTemporalHitlClient({
      request,
      url: "https://my-app.example",
      secret: "s3cret",
    });

    void hitl.waitForHuman({ message: "Approve?", actions: actions().approve().build() });
    await vi.waitFor(() => expect(calls).toHaveLength(1));

    expect(setHandlerMock).toHaveBeenCalledWith("hitl-resume-signal", expect.any(Function));
    expect(calls[0]!.url).toBe("https://my-app.example/.well-known/hitl/v1/requests");
    expect(calls[0]!.headers.authorization).toBe("Bearer s3cret");
    expect(JSON.parse(calls[0]!.body)).toMatchObject({
      token: JSON.stringify({ workflowId: "wf-123", waitToken: "hitl-wait-1" }),
      message: "Approve?",
    });
    expect(conditionMock).toHaveBeenCalled();
  });

  it("prefers HITL_URL, then an explicit url option", async () => {
    process.env.HITL_URL = "http://localhost:3000";
    const a = fakeRequest([{ id: "a1" }]);
    void createTemporalHitlClient({ request: a.request }).waitForHuman({
      message: "m",
      actions: actions().approve().build(),
    });
    await vi.waitFor(() => expect(a.calls).toHaveLength(1));
    expect(a.calls[0]!.url).toBe("http://localhost:3000/.well-known/hitl/v1/requests");

    const b = fakeRequest([{ id: "a1" }]);
    void createTemporalHitlClient({
      request: b.request,
      url: "https://override.example",
    }).waitForHuman({
      message: "m",
      actions: actions().approve().build(),
    });
    await vi.waitFor(() => expect(b.calls).toHaveLength(1));
    expect(b.calls[0]!.url).toBe("https://override.example/.well-known/hitl/v1/requests");
  });

  it("times out via sleep and the /timeout endpoint", async () => {
    const { request, calls } = fakeRequest([
      { id: "a1" },
      { result: { type: "TIMED_OUT", id: "a1", externalRef: "" } },
    ]);
    const hitl = createTemporalHitlClient({
      request,
      url: "https://my-app.example",
    });

    const result = await hitl.waitForHuman({
      message: "m",
      actions: actions().approve().build(),
      timeout: "1h",
    });

    expect(sleepMock).toHaveBeenCalledWith(3_600_000);
    expect(result).toEqual({ type: "TIMED_OUT", id: "a1", externalRef: "" });
    expect(calls[1]!.url).toBe("https://my-app.example/.well-known/hitl/v1/requests/a1/timeout");
  });
});
