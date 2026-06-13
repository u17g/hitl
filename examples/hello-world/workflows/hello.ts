import { field, actions, isResolved, remind, } from "hitl";
import { waitForHuman, notify } from "@/lib/hitl-workflow";


export async function helloWorkflow(name: string) {
  "use workflow";

  const response = await waitForHuman({
    message: `Say hello to ${name}?`,
    actions: actions()
      .approve({ label: "Approve" })
      .deny({
        label: "Deny",
        fields: { reason: field.textArea({ label: "Reason" }) },
      })
      .build(),
    reminders: [remind.after("1h", { message: "Still waiting for approval" })],
  });

  if (!isResolved(response, "approve")) {
    return {
      ok: false,
      actionId: response.type === "RESOLVED" ? response.actionId : response.type,
    };
  }

  await notify({ after: response, message: "Approval granted" });

  await greet(name);
  return { ok: true, greeted: name };
}

async function greet(name: string) {
  "use step";
  console.log(`Hello, ${name}!`);
}
