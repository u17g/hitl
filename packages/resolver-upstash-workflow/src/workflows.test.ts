import { actions } from "@hitl-sdk/hitl";
import type { HitlRequest } from "@hitl-sdk/hitl/core";
import type { WorkflowContext } from "@upstash/workflow";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHitlUpstashWorkflows, type CreateWorkflow } from "./workflows";

// Test list:
// - createHitlUpstashWorkflows builds waitForHuman, requestHuman, notify as invokable workflows
// - each is produced by the injected createWorkflow (framework-agnostic, like inngest's client)
// - waitForHuman's route function suspends via the client and POSTs the request body with the token
// - requestHuman's route function returns a serializable anchor ({ id, batch })
// - notify's route function returns the anchor id

const { sleepMock, waitForEventMock, runMock } = vi.hoisted(() => ({
  sleepMock: vi.fn(async (_id: string, _duration: number | string) => {}),
  waitForEventMock: vi.fn((_id: string, _eventId: string, _opts: unknown) => new Promise(() => {})),
  runMock: vi.fn(async (_id: string, fn: () => Promise<unknown>) => fn()),
}));

/** A fake createWorkflow that records the route functions and returns InvokableWorkflow-shaped objects. */
function trackCreateWorkflow() {
  const routes: Array<(context: WorkflowContext<unknown>) => Promise<unknown>> = [];
  const created: Array<{ routeFunction: unknown; options: unknown }> = [];
  const createWorkflow = ((routeFunction, options) => {
    routes.push(routeFunction as (context: WorkflowContext<unknown>) => Promise<unknown>);
    const wf = { routeFunction, options: options ?? {} };
    created.push(wf);
    return wf;
  }) as CreateWorkflow;
  return { createWorkflow, routes, created };
}

function fakeContext<T>(requestPayload: T, runId = "run_1"): WorkflowContext<T> {
  return {
    workflowRunId: runId,
    requestPayload,
    sleep: sleepMock,
    waitForEvent: waitForEventMock,
    run: runMock,
  } as unknown as WorkflowContext<T>;
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

describe("createHitlUpstashWorkflows", () => {
  it("builds waitForHuman, requestHuman, notify from the injected createWorkflow", () => {
    const { createWorkflow, created } = trackCreateWorkflow();
    const workflows = createHitlUpstashWorkflows(createWorkflow);

    expect(created).toHaveLength(3);
    expect(workflows.waitForHuman).toBe(created[0]);
    expect(workflows.requestHuman).toBe(created[1]);
    expect(workflows.notify).toBe(created[2]);
  });

  it("waitForHuman route function suspends via the client and POSTs the request", async () => {
    const { createWorkflow, routes } = trackCreateWorkflow();
    const { request, calls } = fakeRequest([{ id: "a1" }]);
    createHitlUpstashWorkflows(createWorkflow, { request, url: "https://my-app.example" });

    const payload = { message: "Approve?", actions: actions().approve().build() };
    void routes[0]!(fakeContext(payload));
    await vi.waitFor(() => expect(calls).toHaveLength(1));

    expect(calls[0]!.url).toBe("https://my-app.example/.well-known/hitl/v1/requests");
    expect(JSON.parse(calls[0]!.body)).toMatchObject({
      token: "run_1:hitl-wait-1",
      message: "Approve?",
    });
    expect(waitForEventMock).toHaveBeenCalledWith(
      "run_1:hitl-wait-1",
      "run_1:hitl-wait-1",
      expect.objectContaining({ timeout: expect.any(String) }),
    );
  });

  it("requestHuman route function returns a serializable anchor", async () => {
    const { createWorkflow, routes } = trackCreateWorkflow();
    const { request } = fakeRequest([{ id: "a1" }]);
    createHitlUpstashWorkflows(createWorkflow, { request, url: "https://my-app.example" });

    const result = await routes[1]!(
      fakeContext({ message: "m", actions: actions().approve().build() }),
    );

    expect(result).toEqual({ id: "a1", batch: undefined });
  });

  it("notify route function returns the anchor id", async () => {
    const { createWorkflow, routes } = trackCreateWorkflow();
    const { request } = fakeRequest([{ id: "n1" }]);
    createHitlUpstashWorkflows(createWorkflow, { request, url: "https://my-app.example" });

    const result = await routes[2]!(fakeContext({ message: "done" }));

    expect(result).toEqual({ id: "n1" });
  });
});
