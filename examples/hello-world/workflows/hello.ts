import { field, actions, isResolved, remind } from "hitl";
import { waitForHuman, requestHuman, notify } from "@/lib/hitl-workflow";

export async function helloWorkflow(name: string) {
  "use workflow";

  const pending = await requestHuman({
    message: `Say hello to ${name}?`,
    actions: actions()
      .approve({ label: "Approve" })
      .deny({
        label: "Deny",
        fields: { reason: field.textArea({ label: "Reason" }) },
      })
      .build(),
  });

  await notify({
    after: pending,
    message: `Context for ${name}`,
    detail: { requestedAt: new Date().toISOString() },
  });

  const response = await waitForHuman(pending, {
    reminders: [remind.after("1h", { message: "Still waiting for approval" })],
  });

  if (!isResolved(response, "approve")) {
    return {
      ok: false,
      actionId: response.type === "RESOLVED" ? response.actionId : response.type,
    };
  }
  await greet(name);
  return { ok: true, greeted: name };
}

async function greet(name: string) {
  "use step";
  console.log(`Hello, ${name}!`);
}
