import type { HitlCallback } from "@hitldev/sdk";
import { APPROVE_ACTION, DENY_ACTION, FIELD_BLOCK_PREFIX } from "./render";

interface BlockActionsPayload {
  type: string;
  user?: { id?: string; username?: string; name?: string };
  actions?: { action_id: string; value?: string }[];
  state?: { values?: Record<string, Record<string, StateValue>> };
}

interface StateValue {
  type: string;
  value?: string | null;
  selected_option?: { value: string } | null;
}

/**
 * Parse a Slack interactivity callback (form-encoded `payload`).
 * Returns null when the request is not a Slack hitldev interaction.
 */
export async function parseSlackCallback(req: Request): Promise<HitlCallback | null> {
  if (req.method !== "POST") return null;
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.includes("application/x-www-form-urlencoded")) return null;

  const form = new URLSearchParams(await req.text());
  const rawPayload = form.get("payload");
  if (!rawPayload) return null;

  let payload: BlockActionsPayload;
  try {
    payload = JSON.parse(rawPayload) as BlockActionsPayload;
  } catch {
    return null;
  }
  if (payload.type !== "block_actions") return null;

  const action = payload.actions?.find(
    (a) => a.action_id === APPROVE_ACTION || a.action_id === DENY_ACTION,
  );
  if (!action?.value) return null;

  const decision = action.action_id === APPROVE_ACTION ? "approve" : "deny";

  return {
    requestId: action.value,
    decision,
    by: payload.user && {
      id: payload.user.id,
      name: payload.user.username ?? payload.user.name,
    },
    feedbacks: decision === "approve" ? extractFeedbacks(payload) : undefined,
    // Slack requires a fast empty ack; the message itself is replaced via chat.update.
    response: new Response(null, { status: 200 }),
  };
}

/** Raw form state; the SDK core validates and types it against the field definitions. */
function extractFeedbacks(payload: BlockActionsPayload): Record<string, unknown> | undefined {
  const values = payload.state?.values;
  if (!values) return undefined;

  const feedbacks: Record<string, unknown> = {};
  for (const [blockId, actions] of Object.entries(values)) {
    if (!blockId.startsWith(FIELD_BLOCK_PREFIX)) continue;
    const key = blockId.slice(FIELD_BLOCK_PREFIX.length);
    const state = Object.values(actions)[0];
    if (!state) continue;
    feedbacks[key] = state.selected_option ? state.selected_option.value : state.value;
  }
  return Object.keys(feedbacks).length > 0 ? feedbacks : undefined;
}
