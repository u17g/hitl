import type { HitlBatchCallback, HitlCallback } from "@hitldev/sdk";
import {
  APPROVE_ACTION,
  BATCH_ID_KEY,
  BATCH_SUBMIT_ACTION,
  DENY_ACTION,
  extractBatchDecisions,
  extractFeedbacks,
  HITLDEV_ACTION_KEY,
  REQUEST_ID_KEY,
} from "./render";
import { verifyTeamsRequest } from "./verify";

interface TeamsActivityFrom {
  id?: string;
  name?: string;
  aadObjectId?: string;
}

interface TeamsActivity {
  type?: string;
  value?: Record<string, unknown>;
  from?: TeamsActivityFrom;
}

export interface ParseTeamsCallbackOptions {
  appId: string;
  /** Override fetch for JWKS (for tests). */
  fetch?: typeof fetch;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function reviewerFrom(from: TeamsActivityFrom | undefined) {
  if (!from) return undefined;
  return {
    id: from.aadObjectId ?? from.id,
    name: from.name,
  };
}

/**
 * Parse a Bot Framework activity callback (Adaptive Card Action.Submit).
 * Returns null when the request is not a Teams hitldev interaction.
 */
export async function parseTeamsCallback(
  req: Request,
  options: ParseTeamsCallbackOptions,
): Promise<HitlCallback | HitlBatchCallback | null> {
  if (req.method !== "POST") return null;
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return null;

  const body = await req.text();
  const authorization = req.headers.get("authorization");
  if (!(await verifyTeamsRequest({ appId: options.appId, authorization, fetch: options.fetch }))) {
    return {
      requestId: "",
      decision: "deny",
      response: new Response("Invalid request signature", { status: 401 }),
      ackOnly: true,
    };
  }

  let activity: TeamsActivity;
  try {
    activity = JSON.parse(body) as TeamsActivity;
  } catch {
    return null;
  }

  if (activity.type !== "message") return null;

  const value = activity.value;
  if (!value || typeof value !== "object") return null;

  const action = value[HITLDEV_ACTION_KEY];

  if (action === BATCH_SUBMIT_ACTION) {
    const batchId = value[BATCH_ID_KEY];
    if (typeof batchId !== "string" || !batchId) return null;
    return {
      batchId,
      decisions: extractBatchDecisions(value),
      by: reviewerFrom(activity.from),
      response: jsonResponse({}),
    };
  }

  if (action !== APPROVE_ACTION && action !== DENY_ACTION) return null;

  const requestId = value[REQUEST_ID_KEY];
  if (typeof requestId !== "string" || !requestId) return null;

  const decision = action === APPROVE_ACTION ? "approve" : "deny";

  return {
    requestId,
    decision,
    by: reviewerFrom(activity.from),
    feedbacks: decision === "approve" ? extractFeedbacks(value) : undefined,
    response: jsonResponse({}),
  };
}

export { APPROVE_ACTION, DENY_ACTION, HITLDEV_ACTION_KEY, REQUEST_ID_KEY };
