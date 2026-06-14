import { defineSignal } from "@temporalio/workflow";
import { HITL_RESUME_SIGNAL } from "./constants";

export interface HitlResumePayload {
  waitToken: string;
  payload: unknown;
}

/** Shared resume signal — one per workflow; correlated by `waitToken` in the payload. */
export const hitlResumeSignal = defineSignal<[HitlResumePayload]>(HITL_RESUME_SIGNAL);
