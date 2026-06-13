import { spawn } from "node:child_process";
import pg from "pg";
import { PostgresStore, type PgQueryable } from "@hitl/state-pg";
import { hasFlag, parseFlagValue } from "./args.js";
import { getDatabaseUrl } from "./db-url.js";

const DEFAULT_TABLE = "hitldev.approvals";

export async function ensureHitldevSchema(
  pool: PgQueryable,
  tableName = DEFAULT_TABLE,
): Promise<void> {
  const store = new PostgresStore(pool, { tableName });
  await store.ensureSchema();
}

export async function runWorkflowSetup(connectionString: string): Promise<void> {
  const env = {
    ...process.env,
    WORKFLOW_POSTGRES_URL: process.env.WORKFLOW_POSTGRES_URL ?? connectionString,
    DATABASE_URL: process.env.DATABASE_URL ?? connectionString,
  };

  await new Promise<void>((resolve, reject) => {
    const child = spawn("npx", ["--yes", "workflow-postgres-setup"], {
      env,
      stdio: "inherit",
    });

    child.on("error", (error) => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        console.warn("hitldev: skipped WDK world migrations (npx not found)");
        resolve();
        return;
      }
      reject(error);
    });

    child.on("close", (code) => {
      if (code === 0) {
        console.log("hitldev: applied WDK world migrations");
        resolve();
        return;
      }
      reject(new Error(`workflow-postgres-setup exited with code ${code ?? "unknown"}`));
    });
  });
}

/** Create the hitldev approvals table and optionally run WDK world migrations. */
export async function runSetup(args: string[]): Promise<void> {
  const table = parseFlagValue(args, "--table") ?? DEFAULT_TABLE;
  const skipWorkflow = hasFlag(args, "--skip-workflow");
  const connectionString = getDatabaseUrl();

  const pool = new pg.Pool({ connectionString });
  try {
    await ensureHitldevSchema(pool, table);
    console.log(`hitldev: ensured schema for ${table}`);
  } finally {
    await pool.end();
  }

  if (!skipWorkflow) {
    await runWorkflowSetup(connectionString);
  }
}
