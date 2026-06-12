import type {
  ApprovalRequest,
  ApprovalResult,
  BatchApprovalRequest,
  HitlField,
} from "@hitldev/sdk";

/** Minimal Block Kit shape — only what this plugin emits. */
export interface SlackBlock {
  type: string;
  block_id?: string;
  [key: string]: unknown;
}

const APPROVE_ACTION = "hitldev_approve";
const DENY_ACTION = "hitldev_deny";
const BATCH_SUBMIT_ACTION = "hitldev_batch_submit";
const FIELD_BLOCK_PREFIX = "field:";
const ITEM_BLOCK_PREFIX = "item:";
const ITEM_FIELD_INFIX = ":field:";
const ITEM_DECISION_SUFFIX = ":decision";
const VALUE_ACTION = "value";

export {
  APPROVE_ACTION,
  BATCH_SUBMIT_ACTION,
  DENY_ACTION,
  FIELD_BLOCK_PREFIX,
  ITEM_BLOCK_PREFIX,
  ITEM_DECISION_SUFFIX,
  ITEM_FIELD_INFIX,
  VALUE_ACTION,
};

/** Slack rejects messages over 50 blocks. */
export const MAX_MESSAGE_BLOCKS = 50;

function plainText(text: string) {
  return { type: "plain_text", text };
}

function fieldElement(field: HitlField): Record<string, unknown> {
  switch (field.kind) {
    case "text":
      return {
        type: "plain_text_input",
        action_id: VALUE_ACTION,
        ...(field.default !== undefined && { initial_value: field.default }),
      };
    case "textarea":
      return {
        type: "plain_text_input",
        action_id: VALUE_ACTION,
        multiline: true,
        ...(field.default !== undefined && { initial_value: field.default }),
      };
    case "select": {
      const options = field.options.map((value) => ({ text: plainText(value), value }));
      return {
        type: "static_select",
        action_id: VALUE_ACTION,
        options,
        ...(field.default !== undefined && {
          initial_option: options.find((o) => o.value === field.default),
        }),
      };
    }
    case "confirm": {
      const options = [
        { text: plainText("Yes"), value: "true" },
        { text: plainText("No"), value: "false" },
      ];
      return {
        type: "radio_buttons",
        action_id: VALUE_ACTION,
        options,
        ...(field.default !== undefined && {
          initial_option: options[field.default ? 0 : 1],
        }),
      };
    }
  }
}

/** Render a pending approval: message, one input per field, approve/deny buttons. */
export function renderApprovalBlocks(request: ApprovalRequest): SlackBlock[] {
  const blocks: SlackBlock[] = [
    { type: "section", text: { type: "mrkdwn", text: request.message } },
  ];

  for (const [key, field] of Object.entries(request.fields)) {
    blocks.push({
      type: "input",
      block_id: `${FIELD_BLOCK_PREFIX}${key}`,
      label: plainText(field.label),
      element: fieldElement(field),
    });
  }

  blocks.push({
    type: "actions",
    block_id: "hitldev_actions",
    elements: [
      {
        type: "button",
        action_id: APPROVE_ACTION,
        text: plainText("Approve"),
        style: "primary",
        value: request.id,
      },
      {
        type: "button",
        action_id: DENY_ACTION,
        text: plainText("Deny"),
        style: "danger",
        value: request.id,
      },
    ],
  });

  return blocks;
}

/** The shared field schema with one item's resolved initial value applied. */
function itemField(field: HitlField, defaultValue: unknown): HitlField {
  return defaultValue === undefined
    ? field
    : ({ ...field, default: defaultValue } as HitlField);
}

/**
 * Render a pending batch as a single message: per item a section, the shared
 * field inputs (prefilled with the item's defaults), and an approve/deny
 * choice — closed by one submit button for the whole batch.
 */
export function renderBatchBlocks(request: BatchApprovalRequest): SlackBlock[] {
  const blocks: SlackBlock[] = [];
  if (request.title) {
    blocks.push({ type: "header", text: plainText(request.title) });
  }

  for (const item of request.items) {
    blocks.push({ type: "section", text: { type: "mrkdwn", text: item.message } });

    for (const [key, field] of Object.entries(request.fields)) {
      blocks.push({
        type: "input",
        block_id: `${ITEM_BLOCK_PREFIX}${item.id}${ITEM_FIELD_INFIX}${key}`,
        label: plainText(field.label),
        element: fieldElement(itemField(field, item.defaults[key])),
      });
    }

    const decisionOptions = [
      { text: plainText("Approve"), value: "approve" },
      { text: plainText("Deny"), value: "deny" },
    ];
    blocks.push({
      type: "input",
      block_id: `${ITEM_BLOCK_PREFIX}${item.id}${ITEM_DECISION_SUFFIX}`,
      label: plainText("Decision"),
      element: {
        type: "radio_buttons",
        action_id: VALUE_ACTION,
        options: decisionOptions,
        initial_option: decisionOptions[0],
      },
    });
  }

  blocks.push({
    type: "actions",
    block_id: "hitldev_batch_actions",
    elements: [
      {
        type: "button",
        action_id: BATCH_SUBMIT_ACTION,
        text: plainText("Submit"),
        style: "primary",
        value: request.batchId,
      },
    ],
  });

  return blocks;
}

/** Replace the batch message with per-item outcomes (inputs and buttons removed). */
export function renderBatchResultBlocks(
  request: BatchApprovalRequest,
  results: ApprovalResult[],
): SlackBlock[] {
  const blocks: SlackBlock[] = [];
  if (request.title) {
    blocks.push({ type: "header", text: plainText(request.title) });
  }
  for (const [index, item] of request.items.entries()) {
    blocks.push({ type: "section", text: { type: "mrkdwn", text: item.message } });
    const result = results[index];
    if (result) {
      blocks.push({
        type: "context",
        elements: [{ type: "mrkdwn", text: outcomeLine(result) }],
      });
    }
  }
  return blocks;
}

function outcomeLine(result: ApprovalResult): string {
  const by = "by" in result && result.by?.name ? ` by ${result.by.name}` : "";
  switch (result.type) {
    case "APPROVED":
      return `:white_check_mark: Approved${by}`;
    case "REVIEWED":
      return `:white_check_mark: Approved with edits${by}`;
    case "DENIED":
      return `:no_entry: Denied${by}${result.reason ? ` — ${result.reason}` : ""}`;
    case "TIMED_OUT":
      return ":hourglass: Timed out";
  }
}

/** Replace the interactive message with the outcome (inputs and buttons removed). */
export function renderResultBlocks(message: string, result: ApprovalResult): SlackBlock[] {
  return [
    { type: "section", text: { type: "mrkdwn", text: message } },
    {
      type: "context",
      elements: [{ type: "mrkdwn", text: outcomeLine(result) }],
    },
  ];
}
