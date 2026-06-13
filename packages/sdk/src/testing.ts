import type { HitlResolver, HitlSuspension } from "./binding";
import { createHitlClient, type HitlClient } from "./client";
import { createHitl, type HitlApp } from "./create-hitl";
import type { Store } from "./store";
import type { HitlPlugin } from "./types";

export interface CreateTestHitlOptions {
  plugins: HitlPlugin[];
  store?: Store;
  secret?: string;
}

export interface TestHitl {
  /** The server, as `createHitl` builds it. */
  app: HitlApp;
  /** A workflow client whose fetch is wired straight into `app.fetch` — no network. */
  client: HitlClient;
  /** Resolves the next pending durable `sleep()` (drives timeout/reminder paths). */
  flushSleep(): void;
  /** Durations passed to `sleep()`, in call order. */
  readonly sleepCalls: number[];
}

/**
 * In-process server + client pair for tests: an in-memory engine stands in for
 * the durable one (suspensions are plain promises, timers fire via
 * `flushSleep`), so full waitForApproval → callback → result loops run without
 * a workflow engine or HTTP server.
 */
export function createTestHitl(options: CreateTestHitlOptions): TestHitl {
  const waits = new Map<string, (payload: unknown) => void>();
  let counter = 0;
  const sleepResolvers: Array<() => void> = [];
  const sleepCalls: number[] = [];

  const resolver: HitlResolver = {
    async resolve(token, payload) {
      const resolveFn = waits.get(token);
      if (!resolveFn) throw new Error(`No suspension for token "${token}"`);
      resolveFn(payload);
    },
  };

  const app = createHitl({
    plugins: options.plugins,
    store: options.store,
    resolver,
    secret: options.secret,
  });

  const client = createHitlClient({
    suspend<T>(): HitlSuspension<T> {
      const token = `test-token-${++counter}`;
      let resolveFn!: (payload: T) => void;
      const promise = new Promise<T>((resolve) => (resolveFn = resolve));
      waits.set(token, resolveFn as (payload: unknown) => void);
      return { token, promise };
    },
    sleep(ms: number) {
      sleepCalls.push(ms);
      return new Promise<void>((resolve) => {
        sleepResolvers.push(resolve);
      });
    },
    async request({ url, method, headers, body }) {
      const res = await app.fetch(new Request(url, { method, headers, body }));
      return { status: res.status, ok: res.ok, body: await res.text() };
    },
    url: "http://hitl.test",
    secret: options.secret,
  });

  return {
    app,
    client,
    flushSleep: () => sleepResolvers.shift()?.(),
    sleepCalls,
  };
}
