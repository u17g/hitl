import type { HitlResolver } from "@hitl-sdk/hitl/core";
import type { Client } from "@upstash/workflow";

export interface UpstashWorkflowResolverOptions {
  /** Upstash Workflow client used to notify waiting runs. */
  client: Client;
}

/**
 * Server-side resolver for Upstash Workflow: resumes the run suspended on the
 * event identified by the opaque token. Pass to
 * `new Hitl({ resolver: upstashWorkflowResolver({ client }) })`.
 *
 * The token is the `waitForEvent` event id produced by
 * {@link createUpstashWorkflowHitlClient}, so it is passed straight to `notify`.
 */
export function upstashWorkflowResolver(
  options: UpstashWorkflowResolverOptions,
): HitlResolver {
  return {
    async resolve(token, payload): Promise<void> {
      await options.client.notify({ eventId: token, eventData: payload });
    },
  };
}
