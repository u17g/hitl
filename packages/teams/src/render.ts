import type {
  ApprovalRequest,
  ApprovalResult,
  BatchApprovalRequest,
  HitlBatchCallback,
  HitlField,
} from "@hitldev/sdk";

/** Minimal Adaptive Card shape — only what this plugin emits. */
export interface AdaptiveCard {
  type: string;
  [key: string]: unknown;
}

export const APPROVE_ACTION = "approve";
export const DENY_ACTION = "deny";
export const BATCH_SUBMIT_ACTION = "batch_submit";
export const FIELD_ID_PREFIX = "field:";
export const ITEM_ID_PREFIX = "item:";
export const ITEM_FIELD_INFIX = ":field:";
export const ITEM_DECISION_SUFFIX = ":decision";
export const HITLDEV_ACTION_KEY = "hitldev_action";
export const REQUEST_ID_KEY = "requestId";
export const BATCH_ID_KEY = "batchId";

/** Teams rejects cards over ~28 KB; stay below with some headroom. */
export const MAX_CARD_BYTES = 28_000;

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

/** The shared field schema with one item's resolved initial value applied. */
function itemField(field: HitlField, defaultValue: unknown): HitlField {
  return defaultValue === undefined
    ? field
    : ({ ...field, default: defaultValue } as HitlField);
}

/**
 * Render a pending batch as one card: per item a TextBlock, the shared field
 * inputs (prefilled with the item's defaults), and an approve/deny choice —
 * closed by one submit action for the whole batch.
 */
export function renderBatchCard(request: BatchApprovalRequest): AdaptiveCard {
  const body: AdaptiveCard[] = [];
  if (request.title) {
    body.push({ type: "TextBlock", text: request.title, wrap: true, weight: "Bolder", size: "Large" });
  }

  for (const item of request.items) {
    body.push({
      type: "TextBlock",
      text: item.message,
      wrap: true,
      weight: "Bolder",
      size: "Medium",
      spacing: "Large",
    });

    for (const [key, field] of Object.entries(request.fields)) {
      const input = fieldInput(key, itemField(field, item.defaults[key]));
      body.push({ ...input, id: `${ITEM_ID_PREFIX}${item.id}${ITEM_FIELD_INFIX}${key}` });
    }

    body.push({
      type: "Input.ChoiceSet",
      id: `${ITEM_ID_PREFIX}${item.id}${ITEM_DECISION_SUFFIX}`,
      label: "Decision",
      style: "compact",
      choices: [
        { title: "Approve", value: APPROVE_ACTION },
        { title: "Deny", value: DENY_ACTION },
      ],
      value: APPROVE_ACTION,
    });
  }

  return {
    type: "AdaptiveCard",
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    version: "1.5",
    body,
    actions: [
      {
        type: "Action.Submit",
        title: "Submit",
        style: "positive",
        data: {
          [HITLDEV_ACTION_KEY]: BATCH_SUBMIT_ACTION,
          [BATCH_ID_KEY]: request.batchId,
        },
      },
    ],
  };
}

/** Replace the batch card with per-item outcomes (inputs and actions removed). */
export function renderBatchResultCard(
  request: BatchApprovalRequest,
  results: ApprovalResult[],
): AdaptiveCard {
  const body: AdaptiveCard[] = [];
  if (request.title) {
    body.push({ type: "TextBlock", text: request.title, wrap: true, weight: "Bolder", size: "Large" });
  }
  for (const [index, item] of request.items.entries()) {
    body.push({
      type: "TextBlock",
      text: item.message,
      wrap: true,
      weight: "Bolder",
      size: "Medium",
      spacing: "Large",
    });
    const result = results[index];
    if (result) {
      body.push({ type: "TextBlock", text: outcomeLine(result), wrap: true, isSubtle: true });
    }
  }
  return {
    type: "AdaptiveCard",
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    version: "1.5",
    body,
  };
}

/**
 * Group a batch submit payload into per-item decisions. Input ids are parsed
 * by known prefix/suffix (never `split(":")` — item ids contain colons).
 */
export function extractBatchDecisions(
  value: Record<string, unknown>,
): HitlBatchCallback["decisions"] {
  const collected = new Map<
    string,
    { decision: "approve" | "deny"; feedbacks?: Record<string, unknown> }
  >();
  const entry = (itemId: string) => {
    let item = collected.get(itemId);
    if (!item) {
      item = { decision: "approve" };
      collected.set(itemId, item);
    }
    return item;
  };

  for (const [key, raw] of Object.entries(value)) {
    if (!key.startsWith(ITEM_ID_PREFIX)) continue;

    if (key.endsWith(ITEM_DECISION_SUFFIX)) {
      const itemId = key.slice(ITEM_ID_PREFIX.length, -ITEM_DECISION_SUFFIX.length);
      entry(itemId).decision = raw === DENY_ACTION ? "deny" : "approve";
      continue;
    }

    const infixIndex = key.lastIndexOf(ITEM_FIELD_INFIX);
    if (infixIndex === -1) continue;
    const itemId = key.slice(ITEM_ID_PREFIX.length, infixIndex);
    const fieldKey = key.slice(infixIndex + ITEM_FIELD_INFIX.length);
    const item = entry(itemId);
    item.feedbacks = { ...item.feedbacks, [fieldKey]: raw };
  }

  return [...collected.entries()].map(([requestId, item]) =>
    item.decision === "approve" && item.feedbacks
      ? { requestId, decision: item.decision, feedbacks: item.feedbacks }
      : { requestId, decision: item.decision },
  );
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
