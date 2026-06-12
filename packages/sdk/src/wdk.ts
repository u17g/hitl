import { createHook, sleep } from "workflow";
import { resumeHook } from "workflow/api";
import type { EngineBinding, EngineSuspension } from "./binding";

/**
 * Workflow DevKit binding: suspension is a WDK hook (event-sourced, survives
 * restarts and deploys), resolution is `resumeHook`, the timer is WDK `sleep`.
 */
export const wdkBinding: EngineBinding = {
  suspend<T>(): EngineSuspension<T> {
    const hook = createHook<T>();
    return { token: hook.token, promise: Promise.resolve(hook) };
  },

  async resolve(token, payload): Promise<void> {
    await resumeHook(token, payload as Parameters<typeof resumeHook>[1]);
  },

  sleep(ms: number): Promise<void> {
    return sleep(`${ms}ms`);
  },
};
