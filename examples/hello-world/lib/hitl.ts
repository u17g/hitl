import { createHitl, webui } from "@hitldev/sdk";
import { workflowResolver } from "@hitldev/vercel-workflow";
import { getStore } from "./hitl-store";

// Server half only: store + plugins + the WDK resolver. Workflows talk to it
// through the .well-known/hitldev/v1 API and import nothing from this file.
export const hitl = createHitl({
  plugins: [webui()],
  store: getStore(),
  resolver: workflowResolver(),
});
