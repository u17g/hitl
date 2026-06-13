/**
 * The contract hitl asks of a durable execution engine, split by side:
 *
 * - Workflow side (`WorkflowPrimitives`): suspend with a token, a durable
 *   timer, and a durable fetch. Injected into `createHitlClient` by an engine
 *   package; called from inside workflow code under the engine's determinism
 *   rules. All state/adapter IO happens behind the HTTP API, never here.
 * - Server side (`HitlResolver`): resume a wait by token. Called from a plain
 *   HTTP context when a channel callback arrives — never from workflow code.
 */
export interface HitlSuspension<T> {
  /** Opaque resume token. Sent to the server, stored, and handed back; only the engine interprets it. */
  token: string;
  /** Resolves when the server calls `HitlResolver.resolve(token, payload)`. */
  promise: Promise<T>;
}

/** A request to the hitl server. Plain, serializable data — easy to send from a durable step. */
export interface HitlRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  /** JSON-encoded request body. */
  body: string;
}

/**
 * The server's reply, reduced to serializable fields. A `Response` cannot
 * cross a durable step boundary; this can, so the engine's `request` can be an
 * ordinary `"use step"` function.
 */
export interface HitlResponse {
  status: number;
  ok: boolean;
  /** Raw response body; the client parses it as JSON. */
  body: string;
}

export type HitlRequestFn = (request: HitlRequest) => Promise<HitlResponse>;

export interface WorkflowPrimitives {
  /**
   * Create a durable wait and obtain its resume token.
   * The token must be stable across replays of the same call site.
   */
  suspend<T>(): HitlSuspension<T>;
  /** Durable timer used to implement `timeout` and `reminder`. */
  sleep(ms: number): Promise<void>;
  /**
   * Call the hitl server. Engines implement this as a durable step (e.g. a
   * Workflow DevKit `"use step"` function wrapping `fetch`) so the response is
   * memoized across replays.
   */
  request: HitlRequestFn;
}

export interface HitlResolver {
  /** Resume the wait identified by `token` with a payload. */
  resolve(token: string, payload: unknown): Promise<void>;
}
