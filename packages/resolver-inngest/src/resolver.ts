import type { Inngest } from "inngest";
import type { HitlResolver } from "@hitl-sdk/hitl/core";
import { HITL_RESUME_EVENT } from "./constants";

export interface InngestResolverOptions {
  /** Inngest client used to send resume events. */
  client: Inngest;
  /** Event name for resume payloads. Defaults to {@link HITL_RESUME_EVENT}. */
  event?: string;
}

/**
 * Server-side resolver for Inngest: sends a resume event that the workflow's
 * `step.waitForEvent` is waiting on. Pass to `new Hitl({ resolver: inngestResolver({ client }) })`.
 */
export function inngestResolver(options: InngestResolverOptions): HitlResolver {
  const event = options.event ?? HITL_RESUME_EVENT;

  return {
    async resolve(token, payload): Promise<void> {
      await options.client.send({
        name: event,
        data: { token, payload },
      });
    },
  };
}
