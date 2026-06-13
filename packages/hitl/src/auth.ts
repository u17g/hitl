/**
 * Constant-time string comparison. Hand-rolled XOR loop instead of
 * `node:crypto.timingSafeEqual` so the SDK stays edge-runtime compatible.
 */
export function timingSafeEqualString(a: string, b: string): boolean {
  // Length is not secret here (the expected secret's length is the server's
  // own); still fold it into the result instead of early-returning.
  let mismatch = a.length === b.length ? 0 : 1;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i % (b.length || 1));
  }
  return mismatch === 0;
}

let warnedMissingSecret = false;

/**
 * Bearer auth for the internal `.well-known/hitldev/v1` API (workflow → server).
 * With no secret configured the check is skipped — local development — and a
 * warning is logged once per process.
 */
export function authorizeInternalApi(req: Request, secret: string | undefined): boolean {
  if (!secret) {
    if (!warnedMissingSecret) {
      warnedMissingSecret = true;
      console.warn(
        "hitldev: HITL_SECRET is not set; the internal API accepts unauthenticated requests. " +
          "Set HITL_SECRET (same value for server and workflows) before deploying.",
      );
    }
    return true;
  }

  const header = req.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return false;
  return timingSafeEqualString(header.slice("Bearer ".length), secret);
}
