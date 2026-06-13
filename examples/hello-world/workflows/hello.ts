import { waitForApproval } from "@/lib/hitl-workflow";

export async function helloWorkflow(name: string) {
  "use workflow";

  const approval = await waitForApproval({
    message: `Say hello to ${name}?`,
  });

  if (approval.type !== "APPROVED" && approval.type !== "REVIEWED") {
    return { ok: false, type: approval.type };
  }

  await greet(name);
  return { ok: true, greeted: name };
}

async function greet(name: string) {
  "use step";
  console.log(`Hello, ${name}!`);
}
