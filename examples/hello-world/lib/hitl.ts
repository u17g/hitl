import { Hitl } from "hitl";
import { workflowResolver } from "@hitl/resolver-workflow-sdk";
import { getState } from "./hitl-state";

const globalForHitl = globalThis as typeof globalThis & { __hitl?: Hitl };

function createHitl(): Hitl {
  return new Hitl({
    state: getState(),
    resolver: workflowResolver(),
  });
}

// Server half only: state + the WDK resolver. The web inbox channel is built in,
// so no `adapters` are needed — add Slack/Teams/Discord here to deliver elsewhere.
// Workflows talk to this server through the .well-known/hitldev/v1 API and import
// nothing from this file; the UI drives approvals through `hitl.inbox`.
export const hitl = globalForHitl.__hitl ?? createHitl();
globalForHitl.__hitl = hitl;
