import type { HitlClient, NotifyOptions } from "@hitl-sdk/hitl/client";
import type { HitlRequestFn } from "@hitl-sdk/hitl/core";
import type { Inngest, InngestFunction } from "inngest";
import {
  createInngestHitlClient,
  type CreateInngestHitlClientOptions,
  type InngestStep,
} from "./client";
import {
  HITL_NOTIFY_FUNCTION_ID,
  HITL_REQUEST_HUMAN_FUNCTION_ID,
  HITL_WAIT_FOR_HUMAN_FUNCTION_ID,
} from "./constants";
import {
  HITL_NOTIFY_EVENT,
  HITL_REQUEST_HUMAN_EVENT,
  HITL_WAIT_FOR_HUMAN_EVENT,
  type HitlRequestHumanInvokeResult,
} from "./events";

export type CreateHitlInngestFunctionsOptions = Omit<
  CreateInngestHitlClientOptions,
  "step" | "request"
> & {
  request?: HitlRequestFn;
};

type HitlInvokeHandler = (ctx: {
  event: { data: unknown };
  step: InngestStep;
}) => Promise<unknown>;

/** Inngest functions to pass to `step.invoke` and register in your serve handler. */
export interface HitlInngestFunctions {
  waitForHuman: InngestFunction.Any;
  requestHuman: InngestFunction.Any;
  notify: InngestFunction.Any;
}

/**
 * Registers hitl operations as Inngest functions. Call them from your handlers
 * with `step.invoke({ function: waitForHuman, data: … })` and include all three
 * in your serve `functions` array alongside your app functions.
 */
export function createHitlInngestFunctions<TClient extends Inngest.Any>(
  client: TClient,
  options: CreateHitlInngestFunctionsOptions = {},
): HitlInngestFunctions {
  const waitForHuman = client.createFunction(
    { id: HITL_WAIT_FOR_HUMAN_FUNCTION_ID },
    { event: HITL_WAIT_FOR_HUMAN_EVENT },
    (async ({ event, step }) => {
      const hitl = createInngestHitlClient({ step, ...options });
      return hitl.waitForHuman(
        event.data as Parameters<HitlClient["waitForHuman"]>[0],
      );
    }) satisfies HitlInvokeHandler,
  );

  const requestHuman = client.createFunction(
    { id: HITL_REQUEST_HUMAN_FUNCTION_ID },
    { event: HITL_REQUEST_HUMAN_EVENT },
    (async ({ event, step }) => {
      const hitl = createInngestHitlClient({ step, ...options });
      const pending = await hitl.requestHuman(
        event.data as Parameters<HitlClient["requestHuman"]>[0],
      );
      return {
        id: pending.id,
        batch: "batch" in pending ? pending.batch : undefined,
      } satisfies HitlRequestHumanInvokeResult;
    }) satisfies HitlInvokeHandler,
  );

  const notify = client.createFunction(
    { id: HITL_NOTIFY_FUNCTION_ID },
    { event: HITL_NOTIFY_EVENT },
    (async ({ event, step }) => {
      const hitl = createInngestHitlClient({ step, ...options });
      const anchor = await hitl.notify(event.data as NotifyOptions);
      return { id: anchor.id };
    }) satisfies HitlInvokeHandler,
  );

  return { waitForHuman, requestHuman, notify };
}
