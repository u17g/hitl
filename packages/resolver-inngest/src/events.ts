import type { HumanActionDef } from "@hitl-sdk/hitl";
import type { HitlClient, NotifyOptions, RequestHumanOptions, WaitForHumanOptions } from "@hitl-sdk/hitl/client";

/** Event sent by {@link inngestResolver} to resume a hitl suspension. */
export const HITL_RESUME_EVENT = "hitl-sdk.hitl.resume" as const;

export type HitlResumeEvent = {
  name: typeof HITL_RESUME_EVENT;
  data: {
    token: string;
    payload: unknown;
  };
};

/** Invoke trigger for the `waitForHuman` Inngest function. */
export const HITL_WAIT_FOR_HUMAN_EVENT = "hitl-sdk.function.wait-for-human" as const;

export type HitlWaitForHumanEventData = WaitForHumanOptions<readonly HumanActionDef[]>;

export type HitlWaitForHumanEvent = {
  name: typeof HITL_WAIT_FOR_HUMAN_EVENT;
  data: HitlWaitForHumanEventData;
};

export type HitlWaitForHumanInvokeResult = Awaited<ReturnType<HitlClient["waitForHuman"]>>;

/** Invoke trigger for the `requestHuman` Inngest function. */
export const HITL_REQUEST_HUMAN_EVENT = "hitl-sdk.function.request-human" as const;

export type HitlRequestHumanEventData = RequestHumanOptions<readonly HumanActionDef[]>;

export type HitlRequestHumanEvent = {
  name: typeof HITL_REQUEST_HUMAN_EVENT;
  data: HitlRequestHumanEventData;
};

/** Serializable anchor returned from a `requestHuman` invoke. */
export type HitlRequestHumanInvokeResult = { id: string; batch?: boolean };

/** Invoke trigger for the `notify` Inngest function. */
export const HITL_NOTIFY_EVENT = "hitl-sdk.function.notify" as const;

export type HitlNotifyEvent = {
  name: typeof HITL_NOTIFY_EVENT;
  data: NotifyOptions;
};

export type HitlNotifyInvokeResult = { id: string };

/** All hitl-owned Inngest event payloads for {@link EventSchemas} wiring. */
export type HitlInngestEvent =
  | HitlResumeEvent
  | HitlWaitForHumanEvent
  | HitlRequestHumanEvent
  | HitlNotifyEvent;
