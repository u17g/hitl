/** @jsxImportSource chat */
import type { ApprovalRequest, ApprovalResult, HitlField } from "@hitldev/sdk";
import { Actions, Button, Card, CardText, Modal } from "chat";
import { ACTION_APPROVE, ACTION_DENY, MODAL_CALLBACK } from "./constants";
import { fieldInputs } from "./fields";

/** A pending approval: the message plus Approve/Deny buttons. Feedback fields,
 * if any, are collected by the modal opened on approve (see `approvalModal`). */
export function approvalCard(request: ApprovalRequest) {
  return (
    <Card>
      <CardText>{request.message}</CardText>
      <Actions>
        <Button id={ACTION_APPROVE} value={request.id} style="primary">
          Approve
        </Button>
        <Button id={ACTION_DENY} value={request.id} style="danger">
          Deny
        </Button>
      </Actions>
    </Card>
  );
}

/** The feedback form shown when Approve is clicked on an approval with fields.
 * `requestId` rides in privateMetadata so the submit handler can resolve it. */
export function approvalModal(requestId: string, fields: Record<string, HitlField>) {
  return (
    <Modal
      callbackId={MODAL_CALLBACK}
      title="Review approval"
      privateMetadata={JSON.stringify({ requestId })}
    >
      {fieldInputs(fields)}
    </Modal>
  );
}

/** Replaces the approval card once resolved: message plus outcome, buttons removed. */
export function resultCard(message: string, result: ApprovalResult) {
  return (
    <Card>
      <CardText>{message}</CardText>
      <CardText style="muted">{outcomeLine(result)}</CardText>
    </Card>
  );
}

/** One-line human summary of a resolution. */
export function outcomeLine(result: ApprovalResult): string {
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
