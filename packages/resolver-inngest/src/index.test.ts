import { actions } from "@hitl-sdk/hitl";
import type { HitlRequest } from "@hitl-sdk/hitl/core";
import { Inngest } from "inngest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createInngestHitlClient,
  createHitlInngestFunctions,
  HITL_NOTIFY_EVENT,
  HITL_NOTIFY_FUNCTION_ID,
  HITL_REQUEST_HUMAN_EVENT,
  HITL_REQUEST_HUMAN_FUNCTION_ID,
  HITL_RESUME_EVENT,
  HITL_WAIT_FOR_HUMAN_EVENT,
  HITL_WAIT_FOR_HUMAN_FUNCTION_ID,
  type HitlInngestEvent,
  type HitlWaitForHumanEvent,
  type InngestStep,
} from "./index";

// Test list:
// - suspend() registers waitForEvent with token in POST /requests body
// - waitForEvent uses HITL_RESUME_EVENT and CEL if on async.data.token
// - url comes from HITL_URL or options.url; secret sent as bearer
// - timeout: step.sleep, then returns the /timeout endpoint's result
// - default request uses incrementing hitl-fetch-N step.run IDs
// - createHitlInngestFunctions registers invoke targets for waitForHuman, requestHuman, notify

const { sleepMock, waitForEventMock, runMock } = vi.hoisted(() => ({
  sleepMock: vi.fn(async (_id: string, _duration: string) => {}),
  waitForEventMock: vi.fn(async (_id: string, _opts: unknown) => null),
  runMock: vi.fn(async (_id: string, fn: () => Promise<unknown>) => fn()),
}));

function createStep(includeRun = false): InngestStep {
  const step = {
    sleep: sleepMock,
    waitForEvent: waitForEventMock,
  } as unknown as InngestStep;

  if (includeRun) {
    Object.assign(step, { run: runMock });
  }

  return step;
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
  runMock.mockClear();
  waitForEventMock.mockImplementation(async () => null);
  runMock.mockImplementation(async (_id: string, fn: () => Promise<unknown>) => fn());
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

  it("uses incrementing hitl-fetch-N step IDs for the default request", async () => {
    const fetchMock = vi.fn(async () => ({
      status: 200,
      ok: true,
      text: async () => JSON.stringify({ id: "a1" }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const step = createStep(true);
    const hitl = createInngestHitlClient({ step, url: "https://my-app.example" });

    void hitl.waitForHuman({ message: "m", actions: actions().approve().build() });
    await vi.waitFor(() => expect(runMock).toHaveBeenCalledTimes(1));
    expect(runMock.mock.calls[0]![0]).toBe("hitl-fetch-1");

    vi.unstubAllGlobals();
  });
});

describe("hitl Inngest events", () => {
  it("uses dot-separated event names", () => {
    expect(HITL_RESUME_EVENT).toBe("hitl-sdk.hitl.resume");
    expect(HITL_WAIT_FOR_HUMAN_EVENT).toBe("hitl-sdk.function.wait-for-human");
    expect(HITL_REQUEST_HUMAN_EVENT).toBe("hitl-sdk.function.request-human");
    expect(HITL_NOTIFY_EVENT).toBe("hitl-sdk.function.notify");
  });

  it("types wait-for-human invoke data with name and data", () => {
    const event: HitlWaitForHumanEvent = {
      name: HITL_WAIT_FOR_HUMAN_EVENT,
      data: {
        message: "Approve?",
        actions: actions().approve().build(),
      },
    };
    expect(event.name).toBe("hitl-sdk.function.wait-for-human");
  });

  it("HitlInngestEvent covers resume payloads", () => {
    const event: HitlInngestEvent = {
      name: HITL_RESUME_EVENT,
      data: { token: "hitl-wait-1", payload: { type: "TIMED_OUT", id: "a1" } },
    };
    expect(event.data.token).toBe("hitl-wait-1");
  });
});

describe("createHitlInngestFunctions", () => {
  it("registers waitForHuman, requestHuman, and notify as Inngest functions", () => {
    const inngest = new Inngest({ id: "test-app" });
    const created: Array<{ id: string; handler: (ctx: { event: { data: unknown }; step: InngestStep }) => Promise<unknown> }> = [];
    const originalCreateFunction = inngest.createFunction.bind(inngest);

    vi.spyOn(inngest, "createFunction").mockImplementation((opts, trigger, handler) => {
      created.push({
        id: (opts as { id: string }).id,
        handler: handler as (ctx: { event: { data: unknown }; step: InngestStep }) => Promise<unknown>,
      });
      return originalCreateFunction(opts, trigger, handler);
    });

    const { waitForHuman, requestHuman, notify } = createHitlInngestFunctions(inngest, {
      url: "https://my-app.example",
    });

    expect(created.map((fn) => fn.id)).toEqual([
      HITL_WAIT_FOR_HUMAN_FUNCTION_ID,
      HITL_REQUEST_HUMAN_FUNCTION_ID,
      HITL_NOTIFY_FUNCTION_ID,
    ]);
    expect(waitForHuman).toBeDefined();
    expect(requestHuman).toBeDefined();
    expect(notify).toBeDefined();
  });

  it("waitForHuman invoke target posts to /requests and registers waitForEvent", async () => {
    const { request, calls } = fakeRequest([{ id: "a1" }]);
    const inngest = new Inngest({ id: "test-app" });
    const handlers = new Map<string, (ctx: { event: { data: unknown }; step: InngestStep }) => Promise<unknown>>();
    const originalCreateFunction = inngest.createFunction.bind(inngest);

    vi.spyOn(inngest, "createFunction").mockImplementation((opts, trigger, handler) => {
      handlers.set((opts as { id: string }).id, handler as typeof handlers extends Map<string, infer H> ? H : never);
      return originalCreateFunction(opts, trigger, handler);
    });

    createHitlInngestFunctions(inngest, { request, url: "https://my-app.example" });
    const waitHandler = handlers.get(HITL_WAIT_FOR_HUMAN_FUNCTION_ID)!;

    void waitHandler({
      event: { data: { message: "Approve?", actions: actions().approve().build() } },
      step: createStep(),
    });
    await vi.waitFor(() => expect(calls).toHaveLength(1));

    expect(JSON.parse(calls[0]!.body)).toMatchObject({ token: "hitl-wait-1", message: "Approve?" });
    expect(waitForEventMock).toHaveBeenCalledWith("hitl-wait-1", expect.objectContaining({ event: HITL_RESUME_EVENT }));
  });
});
