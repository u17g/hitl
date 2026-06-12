const TOKEN_URL = "https://login.microsoftonline.com/botframework.com/oauth2/v2.0/token";
const TOKEN_SCOPE = "https://api.botframework.com/.default";
const REFRESH_BUFFER_MS = 5 * 60 * 1000;

interface TokenCache {
  token: string;
  expiresAt: number;
}

export interface BotCredentials {
  appId: string;
  appPassword: string;
  fetch?: typeof fetch;
}

/** Acquire a Bot Framework connector token, cached until shortly before expiry. */
export async function getBotFrameworkToken(credentials: BotCredentials): Promise<string> {
  const fetchImpl = credentials.fetch ?? fetch;
  const cacheKey = credentials.appId;
  const cached = tokenCaches.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt - REFRESH_BUFFER_MS) {
    return cached.token;
  }

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: credentials.appId,
    client_secret: credentials.appPassword,
    scope: TOKEN_SCOPE,
  });

  const res = await fetchImpl(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });

  const data = (await res.json()) as { access_token?: string; expires_in?: number; error?: string };
  if (!res.ok || !data.access_token) {
    throw new Error(`Bot Framework token request failed: ${data.error ?? res.statusText}`);
  }

  const expiresIn = (data.expires_in ?? 3600) * 1000;
  tokenCaches.set(cacheKey, { token: data.access_token, expiresAt: Date.now() + expiresIn });
  return data.access_token;
}

/** Clear cached tokens (for tests). */
export function clearTokenCache(): void {
  tokenCaches.clear();
}

const tokenCaches = new Map<string, TokenCache>();
