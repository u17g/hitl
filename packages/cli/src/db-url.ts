/** Resolve a Postgres connection string from the environment. */
export function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL ?? process.env.WORKFLOW_POSTGRES_URL;
  if (!url) {
    throw new Error("DATABASE_URL or WORKFLOW_POSTGRES_URL is required");
  }
  return url;
}
