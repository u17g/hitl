import { createHitl } from "hitl";
import { workflowResolver } from "@hitldev/vercel-workflow";
import { getStore } from "./hitl-store";

// Server half only: store + the WDK resolver. The web inbox channel is built in,
// so no `plugins` are needed — add Slack/Teams/Discord here to deliver elsewhere.
// Workflows talk to this server through the .well-known/hitldev/v1 API and import
// nothing from this file; the UI drives approvals through `hitl.inbox`.
export const hitl = createHitl({
  store: getStore(),
  resolver: workflowResolver(),
});
