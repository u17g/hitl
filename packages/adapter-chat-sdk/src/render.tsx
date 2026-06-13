/** @jsxImportSource chat */
import type { HumanRequest, HumanResult } from "hitl";
import {
  actionById,
  actionFields,
  effectiveActionLabel,
  effectiveCloseLabel,
  effectiveStyle,
  effectiveSubmitLabel,
} from "hitl";
import type { HitlField, HumanActionDef } from "hitl";
import { Actions, Button, Card, CardText, Modal } from "chat";
import { actionButtonId, actionModalCallback } from "./constants";
import { fieldInputs } from "./fields";

/** A pending human step: message plus action buttons in array order. */
export function humanRequestCard(request: HumanRequest) {
  return (
    <Card>
      <CardText>{request.message}</CardText>
      <Actions>
        {request.actions.map((def) => (
          <Button
            key={def.id}
            id={actionButtonId(def.id)}
            value={request.id}
            style={effectiveStyle(def)}
          >
            {effectiveActionLabel(def)}
          </Button>
        ))}
      </Actions>
    </Card>
  );
}

export function actionModal(
  requestId: string,
  actionId: string,
  fields: Record<string, HitlField>,
  def: HumanActionDef = { id: actionId },
) {
  return (
    <Modal
      callbackId={actionModalCallback(actionId)}
      title={effectiveActionLabel(def)}
      submitLabel={effectiveSubmitLabel(def)}
      closeLabel={effectiveCloseLabel(def)}
      privateMetadata={JSON.stringify({ requestId, actionId })}
    >
      {fieldInputs(fields)}
    </Modal>
  );
}

export function actionModalFromRequest(
  requestId: string,
  actions: HumanRequest["actions"],
  actionId: string,
) {
  const def = actionById(actions, actionId) ?? { id: actionId };
  return actionModal(requestId, actionId, actionFields(def), def);
}

/** Replaces the approval card once resolved: message plus outcome, buttons removed. */
export function resultCard(message: string, result: HumanResult) {
  return (
    <Card>
      <CardText>{message}</CardText>
      <CardText style="muted">{outcomeLine(result)}</CardText>
    </Card>
  );
}

/** One-line human summary of a resolution. */
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
