import { runSchema } from "./schema-cli.js";
import { runSetup } from "./setup.js";

function printHelp(): void {
  process.stdout.write(`@hitl/state-sqlite — database setup and schema export

Usage:
  state-sqlite setup --db <path> [--table hitl.human_requests]
  state-sqlite schema [--table hitl.human_requests]
`);
}

function main(): void {
  const [command, ...rest] = process.argv.slice(2);

  if (command === "setup") {
    runSetup(rest);
    return;
  }

  if (command === "schema") {
    runSchema(rest);
    return;
  }

  printHelp();
  process.exit(command ? 1 : 0);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
