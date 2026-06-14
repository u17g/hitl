import type { Client } from "@temporalio/client";
import type { HitlResolver } from "@hitl-sdk/hitl/core";
import { HITL_RESUME_SIGNAL } from "./constants";
import { decodeHitlToken } from "./token";

export interface TemporalResolverOptions {
  /** Temporal client used to signal running workflows. */
  client: Client;
}

/**
 * Server-side resolver for Temporal: signals the workflow identified in the
 * opaque token. Pass to `new Hitl({ resolver: temporalResolver({ client }) })`.
 */
export function temporalResolver(options: TemporalResolverOptions): HitlResolver {
  return {
    async resolve(token, payload): Promise<void> {
      const { workflowId, waitToken } = decodeHitlToken(token);
      await options.client.workflow.getHandle(workflowId).signal(HITL_RESUME_SIGNAL, {
        waitToken,
        payload,
      });
    },
  };
}
