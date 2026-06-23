import { createHitlClient, type HitlClient } from "@hitl-sdk/hitl/client";
import type { HitlRequest, HitlRequestFn } from "@hitl-sdk/hitl/core";
import type { WorkflowContext } from "@upstash/workflow";
import { WAIT_FOR_EVENT_TIMEOUT } from "./constants";

export interface CreateUpstashWorkflowHitlClientOptions {
  /** The Upstash Workflow context from the current handler (`serve(async (context) => …)`). */
  context: WorkflowContext;
  /**
   * A `context.run` function that performs the HTTP request to the hitl server.
   * Omit to use the built-in durable fetch (`hitl-fetch-1`, `hitl-fetch-2`, …).
   * Override for custom fetch behavior or tests.
   */
  request?: HitlRequestFn;
  /** Base URL of the app hosting the server. Defaults to `HITL_URL`. */
  url?: string;
  /** Where the server is mounted. Defaults to `/.well-known/hitl/v1`. */
  basePath?: string;
  /** Bearer secret of the internal API. Defaults to `HITL_SECRET`. */
  secret?: string;
}

/**
 * The workflow-side hitl client on Upstash Workflow primitives: suspension is
 * `context.waitForEvent` (correlated by a globally-unique event id) and the
 * timer is `context.sleep`. The HTTP call is a durable `context.run` fetch
 * (built-in by default).
 *
 * The resume token is the `waitForEvent` event id. It must be globally unique
 * because `client.notify({ eventId })` resumes every run waiting on that id, so
 * it is namespaced with `context.workflowRunId`. The per-call-site counter keeps
 * it stable across replays of the same run.
 */
export function createUpstashWorkflowHitlClient(
  options: CreateUpstashWorkflowHitlClientOptions,
): HitlClient {
  const { context } = options;
  let waitCounter = 0;
  let sleepCounter = 0;
  let fetchCounter = 0;

  const request =
    options.request ??
    (async (req: HitlRequest) => {
      fetchCounter += 1;
      return context.run(`hitl-fetch-${fetchCounter}`, async () => {
        const res = await fetch(req.url, {
          method: req.method,
          headers: req.headers,
          body: req.body,
        });
        return { status: res.status, ok: res.ok, body: await res.text() };
      });
    });

  return createHitlClient({
    suspend<T>() {
      waitCounter += 1;
      const token = `${context.workflowRunId}:hitl-wait-${waitCounter}`;
      const promise = context
        .waitForEvent(token, token, { timeout: WAIT_FOR_EVENT_TIMEOUT })
        .then(({ eventData, timeout }) => {
          if (timeout) {
            // Timeout/reminder paths exit via context.sleep; leave this wait pending.
            return new Promise<T>(() => {});
          }
          return eventData as T;
        });
      return { token, promise };
    },
    sleep(ms) {
      sleepCounter += 1;
      // Upstash Workflow sleeps in seconds; hitl asks in milliseconds.
      return context.sleep(`hitl-timer-${sleepCounter}`, Math.ceil(ms / 1000));
    },
    request,
    url: options.url ?? (() => process.env.HITL_URL ?? ""),
    basePath: options.basePath,
    secret: options.secret,
  });
}
