/** Resolve a Postgres connection string from the environment. */
export function getDatabaseUrl(): string {
  const url =
    process.env.HITL_POSTGRES_URL ??
    process.env.DATABASE_URL ??
    process.env.WORKFLOW_POSTGRES_URL;
  if (!url) {
    throw new Error(
      "HITL_POSTGRES_URL, DATABASE_URL, or WORKFLOW_POSTGRES_URL is required",
    );
  }
  return url;
}
