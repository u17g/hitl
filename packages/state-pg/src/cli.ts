import { runSchema } from "./schema-cli.js";
import { runSetup } from "./setup.js";

function printHelp(): void {
  process.stdout.write(`@hitl/state-pg — database setup and schema export

Usage:
  state-pg setup [--table hitl.approvals]
  state-pg schema [--table hitl.approvals]

Environment:
  HITL_POSTGRES_URL                       Postgres connection string (setup, preferred)
  DATABASE_URL or WORKFLOW_POSTGRES_URL   Fallback connection strings
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
