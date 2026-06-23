import type { HumanActionDef, HumanResult } from "@hitl-sdk/hitl";
import type {
  HitlClient,
  NotifyOptions,
  RequestHumanOptions,
  WaitForHumanOptions,
} from "@hitl-sdk/hitl/client";
import type {
  InvokableWorkflow,
  RouteFunction,
  WorkflowServeOptions,
} from "@upstash/workflow";
import {
  createUpstashWorkflowHitlClient,
  type CreateUpstashWorkflowHitlClientOptions,
} from "./client";

/**
 * The framework-bound `createWorkflow` factory from `@upstash/workflow/<adapter>`
 * (e.g. `@upstash/workflow/nextjs`). Injected like inngest's `client` so this
 * package stays framework-agnostic — the caller picks the adapter.
 */
export type CreateWorkflow = <TInitialPayload, TResult>(
  routeFunction: RouteFunction<TInitialPayload, TResult>,
  options?: WorkflowServeOptions<TInitialPayload, TResult>,
) => InvokableWorkflow<TInitialPayload, TResult>;

export type CreateHitlUpstashWorkflowsOptions = Omit<
  CreateUpstashWorkflowHitlClientOptions,
  "context"
>;

/** Invoke body for the `waitForHuman` workflow. */
export type HitlWaitForHumanInput = WaitForHumanOptions<readonly HumanActionDef[]>;
/** Invoke body for the `requestHuman` workflow. */
export type HitlRequestHumanInput = RequestHumanOptions<readonly HumanActionDef[]>;
/** Invoke body for the `notify` workflow. */
export type HitlNotifyInput = NotifyOptions;

/** Result returned from a `waitForHuman` invoke. */
export type HitlWaitForHumanInvokeResult = HumanResult<readonly HumanActionDef[]>;
/** Serializable anchor returned from a `requestHuman` invoke. */
export type HitlRequestHumanInvokeResult = { id: string; batch?: boolean };
/** Serializable anchor returned from a `notify` invoke. */
export type HitlNotifyInvokeResult = { id: string };

/** Upstash Workflow invoke targets for hitl operations. */
export interface HitlUpstashWorkflows {
  waitForHuman: InvokableWorkflow<HitlWaitForHumanInput, HitlWaitForHumanInvokeResult>;
  requestHuman: InvokableWorkflow<HitlRequestHumanInput, HitlRequestHumanInvokeResult>;
  notify: InvokableWorkflow<HitlNotifyInput, HitlNotifyInvokeResult>;
}

/**
 * Registers hitl operations as Upstash Workflow invoke targets, mirroring the
 * inngest binding's `createHitlInngestFunctions`. Call them from your handlers
 * with `context.invoke("…", { workflow: waitForHuman, body: … })` and register
 * all three with `serveMany({ waitForHuman, requestHuman, notify, …yours })`.
 *
 * Pass the `createWorkflow` from your framework adapter
 * (`@upstash/workflow/nextjs`, `/hono`, …) so this stays framework-agnostic.
 */
export function createHitlUpstashWorkflows(
  createWorkflow: CreateWorkflow,
  options: CreateHitlUpstashWorkflowsOptions = {},
): HitlUpstashWorkflows {
  const waitForHuman = createWorkflow<HitlWaitForHumanInput, HitlWaitForHumanInvokeResult>(
    async (context) => {
      const hitl = createUpstashWorkflowHitlClient({ context, ...options });
      // invoke crosses a JSON boundary; cast to the single-wait overload.
      return hitl.waitForHuman(
        context.requestPayload as WaitForHumanOptions<readonly HumanActionDef[]> & {
          items?: undefined;
        },
      );
    },
  );

  const requestHuman = createWorkflow<HitlRequestHumanInput, HitlRequestHumanInvokeResult>(
    async (context) => {
      const hitl = createUpstashWorkflowHitlClient({ context, ...options });
      const pending = await hitl.requestHuman(
        context.requestPayload as Parameters<HitlClient["requestHuman"]>[0],
      );
      return {
        id: pending.id,
        batch: "batch" in pending ? pending.batch : undefined,
      } satisfies HitlRequestHumanInvokeResult;
    },
  );

  const notify = createWorkflow<HitlNotifyInput, HitlNotifyInvokeResult>(
    async (context) => {
      const hitl = createUpstashWorkflowHitlClient({ context, ...options });
      const anchor = await hitl.notify(context.requestPayload);
      return { id: anchor.id };
    },
  );

  return { waitForHuman, requestHuman, notify };
}
