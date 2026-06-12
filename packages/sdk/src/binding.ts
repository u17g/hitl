/**
 * The contract hitldev asks of a durable execution engine — exactly four things:
 * suspend with a token, resolve by token, a durable timer, and a durable step.
 *
 * The primitives split into two sides:
 * - Workflow side (`suspend`, `sleep`, `run`): called from inside workflow code,
 *   subject to the engine's determinism rules.
 * - Resolver side (`resolve`): called from a plain HTTP context when a channel
 *   callback arrives — never from workflow code.
 */
export interface EngineSuspension<T> {
  /** Opaque resume token. The core stores it and hands it back; only the binding interprets it. */
  token: string;
  /** Resolves when an external process calls `resolve(token, payload)`. */
  promise: Promise<T>;
}

export interface EngineBinding {
  /**
   * Workflow side: create a durable wait and obtain its resume token.
   * The token must be stable across replays of the same call site.
   */
  suspend<T>(): EngineSuspension<T>;
  /** Resolver side: resume the wait identified by `token` with a payload. */
  resolve(token: string, payload: unknown): Promise<void>;
  /** Workflow side: durable timer used to implement `timeout`. */
  sleep(ms: number): Promise<void>;
  /**
   * Workflow side: run non-deterministic IO as a memoized durable step
   * (Temporal activity, Inngest `step.run`, Restate `ctx.run`). The core may
   * use the same label more than once per run; engines must disambiguate by
   * call order. `fn` executes at-least-once and its return value must be
   * serializable. Engines whose workflow code may perform IO directly (e.g.
   * Workflow DevKit) implement this as a pass-through.
   */
  run<T>(label: string, fn: () => Promise<T>): Promise<T>;
}
