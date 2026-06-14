import { createHitlClient, type HitlClient } from "@hitl-sdk/hitl/client";
import type { HitlRequest, HitlRequestFn } from "@hitl-sdk/hitl/core";
import type { GetStepTools, Inngest } from "inngest";
import { HITL_RESUME_EVENT } from "./events";

/** Inngest requires a waitForEvent timeout; hitl handles real timeouts via step.sleep. */
const WAIT_FOR_EVENT_TIMEOUT = "100y";

/** Inngest step tools from a function handler (`({ step }) => …`). */
export type InngestStep = GetStepTools<Inngest.Any>;

export interface CreateInngestHitlClientOptions {
  /** Inngest step tools from the current function handler. */
  step: InngestStep;
  /**
   * A `step.run` function that performs the HTTP request to the hitl server.
   * Omit to use the built-in durable fetch (`hitl-fetch-1`, `hitl-fetch-2`, …).
   * Override for custom fetch behavior or tests.
   */
  request?: HitlRequestFn;
  /** Event name waited on by `suspend()`. Defaults to {@link HITL_RESUME_EVENT}. */
  event?: string;
  /** Base URL of the app hosting the server. Defaults to `HITL_URL`. */
  url?: string;
  /** Where the server is mounted. Defaults to `/.well-known/hitl/v1`. */
  basePath?: string;
  /** Bearer secret of the internal API. Defaults to `HITL_SECRET`. */
  secret?: string;
}

/**
 * The workflow-side hitl client on Inngest primitives: suspension is
 * `step.waitForEvent` (correlated by token) and the timer is `step.sleep`.
 * The HTTP call is a durable `step.run` fetch (built-in by default).
 */
export function createInngestHitlClient(options: CreateInngestHitlClientOptions): HitlClient {
  const { step } = options;
  const event = options.event ?? HITL_RESUME_EVENT;
  let waitCounter = 0;
  let sleepCounter = 0;
  let fetchCounter = 0;

  const request =
    options.request ??
    (async (req: HitlRequest) => {
      fetchCounter += 1;
      return step.run(`hitl-fetch-${fetchCounter}`, async () => {
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
      const token = `hitl-wait-${waitCounter}`;
      const promise = step
        .waitForEvent(token, {
          event,
          timeout: WAIT_FOR_EVENT_TIMEOUT,
          if: `async.data.token == '${token}'`,
        })
        .then((received) => {
          if (!received) {
            // Timeout/reminder paths exit via step.sleep; leave this wait pending.
            return new Promise<T>(() => {});
          }
          return received.data.payload as T;
        });
      return { token, promise };
    },
    sleep(ms) {
      sleepCounter += 1;
      return step.sleep(`hitl-timer-${sleepCounter}`, `${ms}ms`);
    },
    request,
    url: options.url ?? (() => process.env.HITL_URL ?? ""),
    basePath: options.basePath,
    secret: options.secret,
  });
}
