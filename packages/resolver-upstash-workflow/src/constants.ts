/**
 * Upstash Workflow's `waitForEvent` requires a timeout (it defaults to 7 days).
 * hitl drives real timeouts and reminders through `sleep`, so we set a long
 * sentinel here and treat a `waitForEvent` timeout as "still pending" — mirroring
 * the inngest binding's `"100y"` wait.
 */
export const WAIT_FOR_EVENT_TIMEOUT = "365d" as const;
