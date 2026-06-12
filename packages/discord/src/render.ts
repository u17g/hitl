import type {
  ApprovalRequest,
  ApprovalResult,
  BatchApprovalRequest,
  HitlField,
} from "@hitldev/sdk";

/** Minimal Discord component shape — only what this plugin emits. */
export interface DiscordComponent {
  type: number;
  custom_id?: string;
  [key: string]: unknown;
}

export interface DiscordEmbed {
  description?: string;
  footer?: { text: string };
  [key: string]: unknown;
}

export const APPROVE_PREFIX = "hitldev_approve:";
export const DENY_PREFIX = "hitldev_deny:";
export const MODAL_PREFIX = "hitldev-modal:";
export const FIELD_PREFIX = "field:";
export const BATCH_SELECT_PREFIX = "hitldev_batch_select:";
export const BATCH_SUBMIT_PREFIX = "hitldev_batch_submit:";

/** Discord string selects carry at most 25 options. */
export const MAX_BATCH_ITEMS = 25;

const TEXT_INPUT = 4;
const ACTION_ROW = 1;
const BUTTON = 2;
const STRING_SELECT = 3;
const STYLE_PRIMARY = 1;
const STYLE_DANGER = 4;
const STYLE_SHORT = 1;
const STYLE_PARAGRAPH = 2;

export function approveCustomId(requestId: string): string {
  return `${APPROVE_PREFIX}${requestId}`;
}

export function denyCustomId(requestId: string): string {
  return `${DENY_PREFIX}${requestId}`;
}

export function modalCustomId(requestId: string): string {
  return `${MODAL_PREFIX}${requestId}`;
}

export function batchSelectCustomId(batchId: string): string {
  return `${BATCH_SELECT_PREFIX}${batchId}`;
}

export function batchSubmitCustomId(batchId: string): string {
  return `${BATCH_SUBMIT_PREFIX}${batchId}`;
}

export function parsePrefixedCustomId(prefix: string, customId: string): string | null {
  return customId.startsWith(prefix) ? customId.slice(prefix.length) : null;
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

function fieldPlaceholder(field: HitlField): string | undefined {
  switch (field.kind) {
    case "select":
      return `One of: ${field.options.join(", ")}`;
    case "confirm":
      return "yes or no";
    default:
      return undefined;
  }
}

function fieldInitialValue(field: HitlField): string | undefined {
  if (field.default === undefined) return undefined;
  if (field.kind === "confirm") return field.default ? "yes" : "no";
  return String(field.default);
}

function modalTextInput(key: string, field: HitlField): DiscordComponent {
  return {
    type: TEXT_INPUT,
    custom_id: `${FIELD_PREFIX}${key}`,
    label: field.label.slice(0, 45),
    style: field.kind === "textarea" ? STYLE_PARAGRAPH : STYLE_SHORT,
    required: false,
    ...(fieldPlaceholder(field) && { placeholder: fieldPlaceholder(field) }),
    ...(fieldInitialValue(field) && { value: fieldInitialValue(field) }),
  };
}

/** Render a pending approval: embed description + approve/deny buttons. */
export function renderApprovalMessage(request: ApprovalRequest): {
  embeds: DiscordEmbed[];
  components: DiscordComponent[];
} {
  return {
    embeds: [{ description: request.message }],
    components: [
      {
        type: ACTION_ROW,
        components: [
          {
            type: BUTTON,
            style: STYLE_PRIMARY,
            label: "Approve",
            custom_id: approveCustomId(request.id),
          },
          {
            type: BUTTON,
            style: STYLE_DANGER,
            label: "Deny",
            custom_id: denyCustomId(request.id),
          },
        ],
      },
    ],
  };
}

/** Modal shown when Approve is clicked and feedback fields exist. */
export function renderApprovalModal(
  requestId: string,
  fields: Record<string, HitlField>,
): { custom_id: string; title: string; components: DiscordComponent[] } {
  const components: DiscordComponent[] = Object.entries(fields).map(([key, field]) => ({
    type: ACTION_ROW,
    components: [modalTextInput(key, field)],
  }));

  return {
    custom_id: modalCustomId(requestId),
    title: "Review approval",
    components,
  };
}

/**
 * Render a pending batch as one message: a numbered list in the embed plus a
 * multi select where the chosen items are approved and the rest denied on
 * submit. Field editing is not available in batch mode — Discord has no
 * message-level form; batches with fields fall back to per-item delivery.
 */
export function renderBatchMessage(request: BatchApprovalRequest): {
  embeds: DiscordEmbed[];
  components: DiscordComponent[];
} {
  const lines: string[] = [];
  if (request.title) lines.push(`**${request.title}**`, "");
  for (const [index, item] of request.items.entries()) {
    lines.push(`${index + 1}. ${item.message}`);
  }
  lines.push("", "Selected items are approved on Submit; unselected items are denied.");

  return {
    embeds: [{ description: lines.join("\n") }],
    components: [
      {
        type: ACTION_ROW,
        components: [
          {
            type: STRING_SELECT,
            custom_id: batchSelectCustomId(request.batchId),
            min_values: 0,
            max_values: request.items.length,
            options: request.items.map((item, index) => ({
              label: `${index + 1}. ${item.message}`.slice(0, 100),
              value: item.id,
              default: true,
            })),
          },
        ],
      },
      {
        type: ACTION_ROW,
        components: [
          {
            type: BUTTON,
            style: STYLE_PRIMARY,
            label: "Submit",
            custom_id: batchSubmitCustomId(request.batchId),
          },
        ],
      },
    ],
  };
}

/** Replace the batch message with per-item outcomes (components removed). */
export function renderBatchResultMessage(
  request: BatchApprovalRequest,
  results: ApprovalResult[],
): { embeds: DiscordEmbed[]; components: [] } {
  const lines: string[] = [];
  if (request.title) lines.push(`**${request.title}**`, "");
  for (const [index, item] of request.items.entries()) {
    lines.push(`${index + 1}. ${item.message}`);
    const result = results[index];
    if (result) lines.push(`   ${outcomeLine(result)}`);
  }
  return {
    embeds: [{ description: lines.join("\n") }],
    components: [],
  };
}

/** Replace the interactive message with the outcome (buttons removed). */
export function renderResultMessage(
  message: string,
  result: ApprovalResult,
): { embeds: DiscordEmbed[]; components: [] } {
  return {
    embeds: [
      {
        description: message,
        footer: { text: outcomeLine(result) },
      },
    ],
    components: [],
  };
}

/** Parse raw modal text inputs into feedback values. */
export function parseModalFeedbacks(
  fields: Record<string, HitlField>,
  components: ModalComponent[],
): Record<string, unknown> {
  const byCustomId = new Map<string, string>();
  for (const row of components) {
    for (const component of row.components ?? []) {
      if (component.custom_id && component.value !== undefined) {
        byCustomId.set(component.custom_id, component.value);
      }
    }
  }

  const feedbacks: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(fields)) {
    const raw = byCustomId.get(`${FIELD_PREFIX}${key}`);
    if (raw === undefined) continue;
    feedbacks[key] = parseFieldValue(field, raw);
  }
  return feedbacks;
}

interface ModalComponent {
  components?: { custom_id?: string; value?: string }[];
}

function parseFieldValue(field: HitlField, raw: string): unknown {
  switch (field.kind) {
    case "confirm": {
      const normalized = raw.trim().toLowerCase();
      if (normalized === "yes" || normalized === "true") return true;
      if (normalized === "no" || normalized === "false") return false;
      return raw;
    }
    case "select":
      return raw;
    default:
      return raw;
  }
}
