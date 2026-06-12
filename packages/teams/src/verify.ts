import { createPublicKey, verify as cryptoVerify, type KeyObject } from "node:crypto";

const OPENID_URL = "https://login.botframework.com/v1/.well-known/openidconfiguration";
const VALID_ISSUERS = new Set(["https://api.botframework.com", "https://sts.windows.net/"]);

interface OpenIdConfig {
  jwks_uri: string;
}

interface JwkKey {
  kid: string;
  kty: string;
  n?: string;
  e?: string;
  x5c?: string[];
}

interface JwksResponse {
  keys: JwkKey[];
}

interface JwtHeader {
  alg: string;
  kid?: string;
}

interface JwtPayload {
  aud?: string | string[];
  iss?: string;
  exp?: number;
}

export interface VerifyTeamsRequestOptions {
  appId: string;
  authorization: string | null;
  /** Override OpenID/JWKS fetch (for tests). */
  fetch?: typeof fetch;
}

let jwksCache: { keys: Map<string, KeyObject>; fetchedAt: number } | undefined;

const JWKS_TTL_MS = 24 * 60 * 60 * 1000;

function decodeBase64Url(input: string): Buffer {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  const padLen = (4 - (padded.length % 4)) % 4;
  return Buffer.from(padded + "=".repeat(padLen), "base64");
}

function parseJwt(token: string): { header: JwtHeader; payload: JwtPayload; signed: string; signature: Buffer } | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [headerPart, payloadPart, signaturePart] = parts;
  if (!headerPart || !payloadPart || !signaturePart) return null;
  try {
    const header = JSON.parse(decodeBase64Url(headerPart).toString("utf8")) as JwtHeader;
    const payload = JSON.parse(decodeBase64Url(payloadPart).toString("utf8")) as JwtPayload;
    return {
      header,
      payload,
      signed: `${headerPart}.${payloadPart}`,
      signature: decodeBase64Url(signaturePart),
    };
  } catch {
    return null;
  }
}

function audienceMatches(aud: string | string[] | undefined, appId: string): boolean {
  if (!aud) return false;
  if (Array.isArray(aud)) return aud.includes(appId);
  return aud === appId;
}

function jwkToKey(jwk: JwkKey): KeyObject | null {
  if (jwk.x5c?.[0]) {
    const pem = `-----BEGIN CERTIFICATE-----\n${jwk.x5c[0]}\n-----END CERTIFICATE-----`;
    return createPublicKey(pem);
  }
  if (jwk.kty === "RSA" && jwk.n && jwk.e) {
    return createPublicKey({ key: jwk as unknown as Record<string, string>, format: "jwk" });
  }
  return null;
}

async function loadJwks(fetchImpl: typeof fetch): Promise<Map<string, KeyObject>> {
  if (jwksCache && Date.now() - jwksCache.fetchedAt < JWKS_TTL_MS) {
    return jwksCache.keys;
  }

  const openIdRes = await fetchImpl(OPENID_URL);
  const openId = (await openIdRes.json()) as OpenIdConfig;
  const jwksRes = await fetchImpl(openId.jwks_uri);
  const jwks = (await jwksRes.json()) as JwksResponse;

  const keys = new Map<string, KeyObject>();
  for (const jwk of jwks.keys) {
    const key = jwkToKey(jwk);
    if (key) keys.set(jwk.kid, key);
  }

  jwksCache = { keys, fetchedAt: Date.now() };
  return keys;
}

/** Clear cached JWKS (for tests). */
export function clearJwksCache(): void {
  jwksCache = undefined;
}

/** Install JWKS keys directly (for tests). */
export function setJwksForTests(keys: Map<string, KeyObject>): void {
  jwksCache = { keys, fetchedAt: Date.now() };
}

/** Verify a Bot Framework inbound request JWT from the Authorization header. */
export async function verifyTeamsRequest(options: VerifyTeamsRequestOptions): Promise<boolean> {
  const auth = options.authorization ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(auth);
  if (!match?.[1]) return false;

  const parsed = parseJwt(match[1]);
  if (!parsed || parsed.header.alg !== "RS256") return false;

  const { payload, signed, signature, header } = parsed;
  if (!payload.iss || !VALID_ISSUERS.has(payload.iss)) return false;
  if (!audienceMatches(payload.aud, options.appId)) return false;
  if (!payload.exp || payload.exp * 1000 <= Date.now()) return false;
  if (!header.kid) return false;

  const fetchImpl = options.fetch ?? fetch;
  const keys = await loadJwks(fetchImpl);
  const key = keys.get(header.kid);
  if (!key) return false;

  return cryptoVerify("RSA-SHA256", Buffer.from(signed), key, signature);
}
