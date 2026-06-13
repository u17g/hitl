import { actions } from "@hitl-sdk/hitl";
import type { HitlRequest } from "@hitl-sdk/hitl/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createInngestHitlClient, HITL_RESUME_EVENT, type InngestStep } from "./index";

// Test list:
// - suspend() registers waitForEvent with token in POST /requests body
// - waitForEvent uses HITL_RESUME_EVENT and CEL if on async.data.token
// - url comes from HITL_URL or options.url; secret sent as bearer
// - timeout: step.sleep, then returns the /timeout endpoint's result
// - the user-provided `request` step is the only transport

const { sleepMock, waitForEventMock } = vi.hoisted(() => ({
  sleepMock: vi.fn(async (_id: string, _duration: string) => {}),
  waitForEventMock: vi.fn(async (_id: string, _opts: unknown) => null),
}));

function createStep(): InngestStep {
  return {
    sleep: sleepMock,
    waitForEvent: waitForEventMock,
  } as unknown as InngestStep;
}

/** A fake step.run request function backed by an array of canned JSON bodies. */
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
  waitForEventMock.mockImplementation(async () => null);
  delete process.env.HITL_URL;
  delete process.env.HITL_SECRET;
});

describe("createInngestHitlClient", () => {
  it("POSTs the wait token to /requests and registers waitForEvent", async () => {
    const { request, calls } = fakeRequest([{ id: "a1" }]);
    const step = createStep();
    const hitl = createInngestHitlClient({ step, request, url: "https://my-app.example", secret: "s3cret" });

    void hitl.waitForHuman({ message: "Approve?", actions: actions().approve().build() });
    await vi.waitFor(() => expect(calls).toHaveLength(1));

    expect(calls[0]!.url).toBe("https://my-app.example/.well-known/hitl/v1/requests");
    expect(calls[0]!.headers.authorization).toBe("Bearer s3cret");
    expect(JSON.parse(calls[0]!.body)).toMatchObject({ token: "hitl-wait-1", message: "Approve?" });

    expect(waitForEventMock).toHaveBeenCalledWith("hitl-wait-1", {
      event: HITL_RESUME_EVENT,
      timeout: "100y",
      if: "async.data.token == 'hitl-wait-1'",
    });
  });

  it("prefers HITL_URL, then an explicit url option", async () => {
    process.env.HITL_URL = "http://localhost:3000";
    const a = fakeRequest([{ id: "a1" }]);
    void createInngestHitlClient({ step: createStep(), request: a.request }).waitForHuman({
      message: "m",
      actions: actions().approve().build(),
    });
    await vi.waitFor(() => expect(a.calls).toHaveLength(1));
    expect(a.calls[0]!.url).toBe("http://localhost:3000/.well-known/hitl/v1/requests");

    const b = fakeRequest([{ id: "a1" }]);
    void createInngestHitlClient({
      step: createStep(),
      request: b.request,
      url: "https://override.example",
    }).waitForHuman({
      message: "m",
      actions: actions().approve().build(),
    });
    await vi.waitFor(() => expect(b.calls).toHaveLength(1));
    expect(b.calls[0]!.url).toBe("https://override.example/.well-known/hitl/v1/requests");
  });

  it("times out via step.sleep and the /timeout endpoint", async () => {
    const { request, calls } = fakeRequest([
      { id: "a1" },
      { result: { type: "TIMED_OUT", id: "a1" } },
    ]);
    const hitl = createInngestHitlClient({
      step: createStep(),
      request,
      url: "https://my-app.example",
    });

    const result = await hitl.waitForHuman({
      message: "m",
      actions: actions().approve().build(),
      timeout: "1h",
    });

    expect(sleepMock).toHaveBeenCalledWith("hitl-timer-1", "3600000ms");
    expect(result).toEqual({ type: "TIMED_OUT", id: "a1" });
    expect(calls[1]!.url).toBe("https://my-app.example/.well-known/hitl/v1/requests/a1/timeout");
  });
});
