export function getSiteUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  if (process.env.VERCEL_ENV === "production") return "https://hitl-sdk.dev";
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

export function isProductionSite(): boolean {
  return (
    process.env.VERCEL_ENV === "production" ||
    process.env.NEXT_PUBLIC_SITE_URL === "https://hitl-sdk.dev"
  );
}
