/**
 * The contract openhitl asks of a durable execution engine — exactly three things:
 * suspend with a token, resolve by token, and a durable timer.
 */
export interface EngineSuspension<T> {
  /** Opaque resume token. The core stores it and hands it back; only the binding interprets it. */
  token: string;
  /** Resolves when an external process calls `resolve(token, payload)`. */
  promise: Promise<T>;
}

export interface EngineBinding {
  /** Workflow side: create a durable wait and obtain its resume token. */
  suspend<T>(): EngineSuspension<T>;
  /** Resolver side: resume the wait identified by `token` with a payload. */
  resolve(token: string, payload: unknown): Promise<void>;
  /** Durable timer used to implement `timeout`. */
  sleep(ms: number): Promise<void>;
}
