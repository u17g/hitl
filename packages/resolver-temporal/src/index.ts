import { createHitlClient, type HitlClient } from "@hitl-sdk/hitl/client";
import type { HitlRequestFn, HitlResolver } from "@hitl-sdk/hitl/core";
import { condition, setHandler, sleep, workflowInfo } from "@temporalio/workflow";
import { hitlResumeSignal } from "./signals";
import { encodeHitlToken } from "./token";

export { HITL_RESUME_SIGNAL } from "./constants";
export { hitlResumeSignal, type HitlResumePayload } from "./signals";
export { decodeHitlToken, encodeHitlToken, type HitlToken } from "./token";
export { temporalResolver, type TemporalResolverOptions } from "./resolver";

export interface CreateTemporalHitlClientOptions {
  /**
   * An activity-backed function that performs the HTTP request to the hitl
   * server. Define it in your app so each call is a durable step — typically:
   *
   * ```ts
   * export async function hitlRequestActivity(req: HitlRequest) {
   *   const res = await fetch(req.url, { method: req.method, headers: req.headers, body: req.body });
   *   return { status: res.status, ok: res.ok, body: await res.text() };
   * }
   *
   * // inside the workflow:
   * const request = (req) => proxyActivities<typeof activities>({ startToCloseTimeout: "1m" }).hitlRequestActivity(req);
   * ```
   */
  request: HitlRequestFn;
  /** Base URL of the app hosting the server. Defaults to `HITL_URL`. */
  url?: string;
  /** Where the server is mounted. Defaults to `/.well-known/hitl/v1`. */
  basePath?: string;
  /** Bearer secret of the internal API. Defaults to `HITL_SECRET`. */
  secret?: string;
}

/**
 * The workflow-side hitl client on Temporal primitives: suspension is a signal
 * wait (`condition`) correlated by token, and the timer is `sleep`. The HTTP
 * call is your activity-backed `request` function.
 *
 * Call once per workflow execution (e.g. at the top of your workflow function).
 */
export function createTemporalHitlClient(options: CreateTemporalHitlClientOptions): HitlClient {
  const pending = new Map<string, unknown>();

  setHandler(hitlResumeSignal, ({ waitToken, payload }) => {
    pending.set(waitToken, payload);
  });

  let waitCounter = 0;

  return createHitlClient({
    suspend<T>() {
      waitCounter += 1;
      const waitToken = `hitl-wait-${waitCounter}`;
      const token = encodeHitlToken(workflowInfo().workflowId, waitToken);
      const promise = condition(() => pending.has(waitToken)).then(
        () => pending.get(waitToken) as T,
      );
      return { token, promise };
    },
    sleep: (ms) => sleep(ms),
    request: options.request,
    url: options.url ?? (() => process.env.HITL_URL ?? ""),
    basePath: options.basePath,
    secret: options.secret,
  });
}

export type { HitlClient, HumanBatchPending, HumanPending } from "@hitl-sdk/hitl/client";
export type { HitlRequestFn, HitlResolver } from "@hitl-sdk/hitl/core";
