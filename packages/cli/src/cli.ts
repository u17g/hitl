import { runSchema } from "./schema.js";
import { runSetup } from "./setup.js";

function printHelp(): void {
  process.stdout.write(`hitldev — database setup and schema export

Usage:
  hitldev setup [--table hitldev.approvals] [--skip-workflow]
  hitldev schema [--table hitldev.approvals] [--dialect postgres|sqlite]

Environment:
  DATABASE_URL or WORKFLOW_POSTGRES_URL   Postgres connection string (setup)
`);
}

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);

  if (command === "setup") {
    await runSetup(rest);
    return;
  }

  if (command === "schema") {
    runSchema(rest);
    return;
  }

  printHelp();
  process.exit(command ? 1 : 0);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
