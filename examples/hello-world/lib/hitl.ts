import { Hitl } from "hitl";
import { InMemoryState } from "hitl/state";
import { workflowResolver } from "@hitl/resolver-workflow-sdk";

// Server half: state + WDK resolver. Workflows POST to `.well-known/hitl/v1`;
// the UI drives approvals through `hitl.inbox`.
export const hitl = new Hitl({
  state: new InMemoryState(),
  resolver: workflowResolver(),
});
