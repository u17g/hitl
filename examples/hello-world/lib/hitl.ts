import { Hitl } from "@hitl-sdk/hitl";
import { InMemoryState } from "@hitl-sdk/hitl/state";
import { workflowResolver } from "@hitl-sdk/resolver-workflow-sdk";

// Server half: state + WDK resolver. Workflows POST to `.well-known/hitl/v1`;
// the UI drives approvals through `hitl.inbox`.
export const hitl = new Hitl({
  state: new InMemoryState(),
  resolver: workflowResolver(),
});
