import type { HumanRequest, HumanResult, HitlField, HumanActionDef } from "@hitl-sdk/hitl/adapter";
import {
  actionById,
  actionFields,
  effectiveActionLabel,
  effectiveStyle,
} from "@hitl-sdk/hitl/adapter";
import type { messagingApi } from "@line/bot-sdk";
import {
  CONFIRM_NO,
  CONFIRM_YES,
  encodePostback,
  POSTBACK_KIND_ACTION,
  POSTBACK_KIND_FIELD_VALUE,
} from "./constants";
import { canUseInlineFlex, needsFeedbackStep, needsLiff } from "./fields";

type FlexMessage = messagingApi.FlexMessage;
type FlexBubble = messagingApi.FlexBubble;
type FlexButton = messagingApi.FlexButton;
type FlexBox = messagingApi.FlexBox;
type FlexText = messagingApi.FlexText;

function flexText(text: string, opts?: { size?: FlexText["size"]; wrap?: boolean; color?: string }): FlexText {
  return {
    type: "text",
    text,
    wrap: opts?.wrap ?? true,
    ...(opts?.size ? { size: opts.size } : {}),
    ...(opts?.color ? { color: opts.color } : {}),
  };
}

function flexButton(
  label: string,
  action: FlexButton["action"],
  style?: FlexButton["style"],
): FlexButton {
  return {
    type: "button",
    action,
    style: style ?? "secondary",
    height: "sm",
  };
}

function buttonStyle(def: HumanActionDef): FlexButton["style"] {
  const style = effectiveStyle(def);
  if (style === "primary") return "primary";
  if (style === "danger") return "secondary";
  return "link";
}

function actionButton(
  requestId: string,
  def: HumanActionDef,
  liffUri?: string,
): FlexButton {
  const fields = actionFields(def);
  if (needsLiff(fields)) {
    if (!liffUri) {
      throw new Error(
        `LINE action "${def.id}" requires LIFF for feedback fields; set liffId on createLineAdapter.`,
      );
    }
    return flexButton(
      effectiveActionLabel(def),
      { type: "uri", label: effectiveActionLabel(def), uri: liffUri },
      buttonStyle(def),
    );
  }
  return flexButton(
    effectiveActionLabel(def),
    {
      type: "postback",
      label: effectiveActionLabel(def),
      data: encodePostback({ k: POSTBACK_KIND_ACTION, r: requestId, a: def.id }),
      displayText: effectiveActionLabel(def),
    },
    buttonStyle(def),
  );
}

function buttonRow(contents: FlexButton[]): FlexBox {
  return { type: "box", layout: "vertical", spacing: "sm", contents };
}

function approvalBubble(request: HumanRequest, liffUriFor?: (actionId: string) => string | undefined): FlexBubble {
  const buttons = request.actions.map((def) =>
    actionButton(request.id, def, liffUriFor?.(def.id)),
  );
  return {
    type: "bubble",
    body: {
      type: "box",
      layout: "vertical",
      spacing: "md",
      contents: [flexText(request.message), buttonRow(buttons)],
    },
  };
}

export function buildApprovalFlex(
  request: HumanRequest,
  liffUriFor?: (actionId: string) => string | undefined,
): FlexMessage {
  return {
    type: "flex",
    altText: request.message.slice(0, 400),
    contents: approvalBubble(request, liffUriFor),
  };
}

export function buildFieldStepFlex(
  requestId: string,
  actionId: string,
  fieldKey: string,
  field: HitlField,
): FlexMessage {
  const def = { id: actionId };
  const title =
    field.kind === "select" || field.kind === "confirm" ? field.label : field.label;

  let buttons: FlexButton[];
  if (field.kind === "confirm") {
    buttons = [
      flexButton("Yes", {
        type: "postback",
        label: "Yes",
        data: encodePostback({
          k: POSTBACK_KIND_FIELD_VALUE,
          r: requestId,
          a: actionId,
          f: fieldKey,
          v: CONFIRM_YES,
        }),
        displayText: "Yes",
      }),
      flexButton("No", {
        type: "postback",
        label: "No",
        data: encodePostback({
          k: POSTBACK_KIND_FIELD_VALUE,
          r: requestId,
          a: actionId,
          f: fieldKey,
          v: CONFIRM_NO,
        }),
        displayText: "No",
      }),
    ];
  } else if (field.kind === "select") {
    buttons = field.options.map((option: string) =>
      flexButton(
        option,
        {
          type: "postback",
          label: option,
          data: encodePostback({
            k: POSTBACK_KIND_FIELD_VALUE,
            r: requestId,
            a: actionId,
            f: fieldKey,
            v: option,
          }),
          displayText: option,
        },
        "link",
      ),
    );
  } else {
    buttons = [];
  }

  void def;
  return {
    type: "flex",
    altText: title.slice(0, 400),
    contents: {
      type: "bubble",
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        contents: [flexText(title), buttonRow(buttons)],
      },
    },
  };
}

export function buildOutcomeText(message: string, result: HumanResult): string {
  return `${message}\n\n${outcomeLine(result)}`;
}

export function outcomeLine(result: HumanResult): string {
  const by = "by" in result && result.by?.name ? ` by ${result.by.name}` : "";
  switch (result.type) {
    case "RESOLVED": {
      const edited = result.edited ? " with edits" : "";
      const reason =
        result.actionId === "deny" &&
        result.feedbacks &&
        typeof result.feedbacks === "object" &&
        "reason" in result.feedbacks &&
        typeof result.feedbacks.reason === "string"
          ? ` — ${result.feedbacks.reason}`
          : "";
      const label =
        result.actionId === "approve"
          ? `Approved${edited}`
          : result.actionId === "deny"
            ? `Denied${reason}`
            : `${result.actionId}${edited}`;
      return `${label}${by}`;
    }
    case "TIMED_OUT":
      return "Timed out";
  }
}

export function fieldStepForAction(
  requestId: string,
  actions: HumanRequest["actions"],
  actionId: string,
): FlexMessage | undefined {
  const def = actionById(actions, actionId);
  if (!def) return undefined;
  const fields = actionFields(def);
  if (!needsFeedbackStep(fields) || !canUseInlineFlex(fields)) return undefined;
  const [fieldKey, field] = Object.entries(fields)[0]!;
  return buildFieldStepFlex(requestId, actionId, fieldKey, field);
}
