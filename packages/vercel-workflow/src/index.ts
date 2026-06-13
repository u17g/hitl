import {
  createHitlClient,
  type HitlClient,
  type HitlRequestFn,
  type HitlResolver,
} from "@hitldev/sdk";
import { createHook, getWorkflowMetadata, sleep } from "workflow";

export { workflowResolver } from "./resolver";

export interface WorkflowHitlOptions {
  /**
   * A `"use step"` function that performs the HTTP request to the hitldev
   * server. Define it in your app (not a dependency) so the Workflow DevKit
   * compiler picks up the directive — typically:
   *
   * ```ts
   * async function hitlRequest(req) {
   *   "use step";
   *   const res = await fetch(req.url, { method: req.method, headers: req.headers, body: req.body });
   *   return { status: res.status, ok: res.ok, body: await res.text() };
   * }
   * ```
   */
  request: HitlRequestFn;
  /** Base URL of the app hosting the server. Defaults to `HITLDEV_URL`, then the deployment's own URL. */
  url?: string;
  /** Where the server is mounted. Defaults to `/.well-known/hitldev/v1`. */
  basePath?: string;
  /** Bearer secret of the internal API. Defaults to `HITLDEV_SECRET`. */
  secret?: string;
}

/**
 * The workflow-side hitldev client on Workflow DevKit primitives: suspension
 * is a WDK hook (event-sourced, survives restarts and deploys) and the timer
 * is WDK `sleep`. The HTTP call is your `"use step"` `request` function, so
 * there is no special bundling — ordinary step rules apply.
 */
export function workflowHitl(options: WorkflowHitlOptions): HitlClient {
  return createHitlClient({
    suspend<T>() {
      const hook = createHook<T>();
      return { token: hook.token, promise: Promise.resolve(hook) };
    },
    sleep: (ms) => sleep(`${ms}ms`),
    request: options.request,
    url: options.url ?? (() => process.env.HITLDEV_URL ?? getWorkflowMetadata().url),
    basePath: options.basePath,
    secret: options.secret,
  });
}

export type { HitlClient, HitlRequestFn, HitlResolver };
