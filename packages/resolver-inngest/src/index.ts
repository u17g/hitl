import { createHitlClient, type HitlClient } from "hitl/client";
import type { HitlRequestFn, HitlResolver } from "hitl/core";
import type { GetStepTools, Inngest } from "inngest";
import { HITL_RESUME_EVENT } from "./constants";

/** Inngest requires a waitForEvent timeout; hitl handles real timeouts via step.sleep. */
const WAIT_FOR_EVENT_TIMEOUT = "100y";

export { HITL_RESUME_EVENT } from "./constants";
export { inngestResolver, type InngestResolverOptions } from "./resolver";

/** Inngest step tools from a function handler (`({ step }) => …`). */
export type InngestStep = GetStepTools<Inngest.Any>;

export interface CreateInngestHitlClientOptions {
  /** Inngest step tools from the current function handler. */
  step: InngestStep;
  /**
   * A `step.run` function that performs the HTTP request to the hitl server.
   * Define it in your app so each call is a durable step — typically:
   *
   * ```ts
   * async function hitlRequest(req: HitlRequest) {
   *   return step.run("hitl-fetch", async () => {
   *     const res = await fetch(req.url, { method: req.method, headers: req.headers, body: req.body });
   *     return { status: res.status, ok: res.ok, body: await res.text() };
   *   });
   * }
   * ```
   */
  request: HitlRequestFn;
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
 * The HTTP call is your `step.run` `request` function.
 */
export function createInngestHitlClient(options: CreateInngestHitlClientOptions): HitlClient {
  const { step, request } = options;
  const event = options.event ?? HITL_RESUME_EVENT;
  let waitCounter = 0;
  let sleepCounter = 0;

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

export type { HitlClient, HumanBatchPending, HumanPending } from "hitl/client";
export type { HitlRequestFn, HitlResolver } from "hitl/core";
