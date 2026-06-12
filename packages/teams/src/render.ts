import type { ApprovalRequest, ApprovalResult, HitlField } from "@hitldev/sdk";

/** Minimal Adaptive Card shape — only what this plugin emits. */
export interface AdaptiveCard {
  type: string;
  [key: string]: unknown;
}

export const APPROVE_ACTION = "approve";
export const DENY_ACTION = "deny";
export const FIELD_ID_PREFIX = "field:";
export const HITLDEV_ACTION_KEY = "hitldev_action";
export const REQUEST_ID_KEY = "requestId";

function fieldInput(key: string, field: HitlField): AdaptiveCard {
  const id = `${FIELD_ID_PREFIX}${key}`;
  switch (field.kind) {
    case "text":
      return {
        type: "Input.Text",
        id,
        label: field.label,
        ...(field.default !== undefined && { value: field.default }),
      };
    case "textarea":
      return {
        type: "Input.Text",
        id,
        label: field.label,
        isMultiline: true,
        ...(field.default !== undefined && { value: field.default }),
      };
    case "select":
      return {
        type: "Input.ChoiceSet",
        id,
        label: field.label,
        style: "compact",
        choices: field.options.map((value) => ({ title: value, value })),
        ...(field.default !== undefined && { value: field.default }),
      };
    case "confirm":
      return {
        type: "Input.ChoiceSet",
        id,
        label: field.label,
        style: "compact",
        choices: [
          { title: "Yes", value: "true" },
          { title: "No", value: "false" },
        ],
        ...(field.default !== undefined && { value: field.default ? "true" : "false" }),
      };
  }
}

function cardBody(message: string, fields: Record<string, HitlField>): AdaptiveCard[] {
  const body: AdaptiveCard[] = [
    { type: "TextBlock", text: message, wrap: true, weight: "Bolder", size: "Medium" },
  ];
  for (const [key, field] of Object.entries(fields)) {
    body.push(fieldInput(key, field));
  }
  return body;
}

/** Render a pending approval: message, one input per field, approve/deny actions. */
export function renderApprovalCard(request: ApprovalRequest): AdaptiveCard {
  return {
    type: "AdaptiveCard",
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    version: "1.5",
    body: cardBody(request.message, request.fields),
    actions: [
      {
        type: "Action.Submit",
        title: "Approve",
        style: "positive",
        data: {
          [HITLDEV_ACTION_KEY]: APPROVE_ACTION,
          [REQUEST_ID_KEY]: request.id,
        },
      },
      {
        type: "Action.Submit",
        title: "Deny",
        style: "destructive",
        data: {
          [HITLDEV_ACTION_KEY]: DENY_ACTION,
          [REQUEST_ID_KEY]: request.id,
        },
      },
    ],
  };
}

function outcomeLine(result: ApprovalResult): string {
  const by = "by" in result && result.by?.name ? ` by ${result.by.name}` : "";
  switch (result.type) {
    case "APPROVED":
      return `Approved${by}`;
    case "REVIEWED":
      return `Approved with edits${by}`;
    case "DENIED":
      return `Denied${by}${result.reason ? ` — ${result.reason}` : ""}`;
    case "TIMED_OUT":
      return "Timed out";
  }
}

/** Replace the interactive card with the outcome (inputs and actions removed). */
export function renderResultCard(message: string, result: ApprovalResult): AdaptiveCard {
  return {
    type: "AdaptiveCard",
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    version: "1.5",
    body: [
      { type: "TextBlock", text: message, wrap: true, weight: "Bolder", size: "Medium" },
      { type: "TextBlock", text: outcomeLine(result), wrap: true, isSubtle: true, spacing: "Medium" },
    ],
  };
}

/** Extract feedback values from an Adaptive Card submit payload. */
export function extractFeedbacks(value: Record<string, unknown>): Record<string, unknown> | undefined {
  const feedbacks: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (!key.startsWith(FIELD_ID_PREFIX)) continue;
    feedbacks[key.slice(FIELD_ID_PREFIX.length)] = raw;
  }
  return Object.keys(feedbacks).length > 0 ? feedbacks : undefined;
}
