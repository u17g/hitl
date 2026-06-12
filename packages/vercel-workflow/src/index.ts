import { createHook, sleep } from "workflow";
import { resumeHook } from "workflow/api";
import type { EngineBinding, EngineSuspension } from "@hitldev/sdk";

/**
 * Workflow DevKit binding: suspension is a WDK hook (event-sourced, survives
 * restarts and deploys), resolution is `resumeHook`, the timer is WDK `sleep`.
 */
export function vercelWorkflowBinding(): EngineBinding {
  return {
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

    // WDK workflow code may perform IO directly; "use step" is a compiler
    // directive that cannot be synthesized at runtime, so run is a pass-through.
    run<T>(_label: string, fn: () => Promise<T>): Promise<T> {
      return fn();
    },
  };
}
