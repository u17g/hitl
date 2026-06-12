import type { ApprovalRequest, ApprovalResult, HitlField } from "@openhitl/sdk";

/** Minimal Block Kit shape — only what this plugin emits. */
export interface SlackBlock {
  type: string;
  block_id?: string;
  [key: string]: unknown;
}

const APPROVE_ACTION = "openhitl_approve";
const DENY_ACTION = "openhitl_deny";
const FIELD_BLOCK_PREFIX = "field:";
const VALUE_ACTION = "value";

export { APPROVE_ACTION, DENY_ACTION, FIELD_BLOCK_PREFIX, VALUE_ACTION };

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
    block_id: "openhitl_actions",
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
