import type { HitlResolver } from "hitl";

/**
 * Server-side resolver for Workflow DevKit: resumes the hook a workflow
 * suspended on. Pass to `createHitl({ resolver: workflowResolver() })`.
 * `workflow/api` is imported lazily so route modules stay light until a
 * callback actually resolves something.
 */
export function workflowResolver(): HitlResolver {
  return {
    async resolve(token, payload): Promise<void> {
      const { resumeHook } = await import("workflow/api");
      await resumeHook(token, payload as Parameters<typeof resumeHook>[1]);
    },
  };
}
