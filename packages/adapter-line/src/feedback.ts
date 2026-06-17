import { createHmac, timingSafeEqual } from "node:crypto";
import { actionById, actionFields, validateFeedbacks, type HitlField } from "@hitl-sdk/hitl/adapter";
import type { HitlInbox } from "@hitl-sdk/hitl/state";
import { LINE_FEEDBACK_PATH } from "./constants.js";
import { parseFieldValue } from "./fields.js";

export interface FeedbackTokenPayload {
  requestId: string;
  actionId: string;
  exp: number;
}

const TOKEN_SEP = ".";

function base64UrlEncode(data: string): string {
  return Buffer.from(data, "utf8").toString("base64url");
}

function base64UrlDecode(data: string): string {
  return Buffer.from(data, "base64url").toString("utf8");
}

function signPayload(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function signFeedbackToken(
  opts: { requestId: string; actionId: string; secret: string; ttlSeconds?: number },
): string {
  const exp = Math.floor(Date.now() / 1000) + (opts.ttlSeconds ?? 3600);
  const body = base64UrlEncode(JSON.stringify({ requestId: opts.requestId, actionId: opts.actionId, exp }));
  const sig = signPayload(body, opts.secret);
  return `${body}${TOKEN_SEP}${sig}`;
}

export function verifyFeedbackToken(token: string, secret: string): FeedbackTokenPayload | undefined {
  const sep = token.lastIndexOf(TOKEN_SEP);
  if (sep === -1) return undefined;
  const body = token.slice(0, sep);
  const sig = token.slice(sep + 1);
  const expected = signPayload(body, secret);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return undefined;
  try {
    const parsed = JSON.parse(base64UrlDecode(body)) as FeedbackTokenPayload;
    if (typeof parsed.requestId !== "string" || typeof parsed.actionId !== "string") return undefined;
    if (typeof parsed.exp !== "number" || parsed.exp < Math.floor(Date.now() / 1000)) return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}

export function buildLiffUri(liffId: string, token: string): string {
  return `https://liff.line.me/${liffId}?token=${encodeURIComponent(token)}`;
}

export function buildFeedbackFormHtml(opts: {
  fields: Record<string, HitlField>;
  token: string;
  submitUrl: string;
  title?: string;
}): string {
  const { fields, token, submitUrl, title = "Submit feedback" } = opts;
  const inputs = Object.entries(fields)
    .map(([key, field]) => renderFieldInput(key, field))
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 1rem; }
    label { display: block; margin: 0.75rem 0 0.25rem; font-weight: 600; }
    input, textarea, select { width: 100%; box-sizing: border-box; padding: 0.5rem; }
    button { margin-top: 1rem; padding: 0.75rem 1rem; width: 100%; }
  </style>
  <script src="https://static.line-scdn.net/liff/edge/2/sdk.js"></script>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <form id="form">
    ${inputs}
    <button type="submit">Submit</button>
  </form>
  <script>
    const token = ${JSON.stringify(token)};
    const submitUrl = ${JSON.stringify(submitUrl)};
    async function init() {
      await liff.init({});
    }
    document.getElementById("form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const form = e.target;
      const data = new FormData(form);
      const feedbacks = Object.fromEntries(data.entries());
      const res = await fetch(submitUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, feedbacks }),
      });
      if (!res.ok) {
        alert("Submit failed");
        return;
      }
      if (liff.isInClient()) await liff.closeWindow();
    });
    init().catch(console.error);
  </script>
</body>
</html>`;
}

function renderFieldInput(key: string, field: HitlField): string {
  const id = escapeHtml(key);
  const label = escapeHtml(field.label);
  switch (field.kind) {
    case "text":
      return `<label for="${id}">${label}</label><input id="${id}" name="${id}" type="text" value="${escapeHtml(field.default ?? "")}" />`;
    case "textarea":
      return `<label for="${id}">${label}</label><textarea id="${id}" name="${id}">${escapeHtml(field.default ?? "")}</textarea>`;
    case "select": {
      const options = field.options
        .map(
          (o) =>
            `<option value="${escapeHtml(o)}"${field.default === o ? " selected" : ""}>${escapeHtml(o)}</option>`,
        )
        .join("");
      return `<label for="${id}">${label}</label><select id="${id}" name="${id}">${options}</select>`;
    }
    case "confirm": {
      const yes = field.default === true ? " selected" : "";
      const no = field.default === false ? " selected" : "";
      return `<label for="${id}">${label}</label><select id="${id}" name="${id}"><option value="yes"${yes}>Yes</option><option value="no"${no}>No</option></select>`;
    }
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export interface LineFeedbackHandlerOptions {
  inbox: () => HitlInbox;
  secret: string;
}

export function createLineFeedbackHandler(
  options: LineFeedbackHandlerOptions,
): (request: Request) => Promise<Response> {
  return async (request: Request) => {
    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }
    let body: { token?: string; feedbacks?: Record<string, unknown> };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return new Response("Invalid JSON", { status: 400 });
    }
    if (!body.token || !body.feedbacks) {
      return new Response("Missing token or feedbacks", { status: 400 });
    }

    const parsed = verifyFeedbackToken(body.token, options.secret);
    if (!parsed) {
      return new Response("Invalid or expired token", { status: 401 });
    }

    const inbox = options.inbox();
    const record = await inbox.get(parsed.requestId);
    if (!record) {
      return new Response("Request not found", { status: 404 });
    }

    const def = actionById(record.actions, parsed.actionId);
    if (!def) {
      return new Response("Unknown action", { status: 400 });
    }

    const fields = actionFields(def);
    const coerced: Record<string, unknown> = {};
    for (const [key, field] of Object.entries(fields)) {
      const raw = body.feedbacks[key];
      if (raw === undefined) continue;
      coerced[key] = typeof raw === "string" ? parseFieldValue(field, raw) : raw;
    }
    let feedbacks;
    try {
      feedbacks = validateFeedbacks(fields, coerced);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Validation failed";
      return new Response(message, { status: 400 });
    }

    await inbox.resolve(parsed.requestId, {
      actionId: parsed.actionId,
      feedbacks,
    });

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
}

export function createLineFeedbackFormHandler(options: {
  secret: string;
  inbox: () => HitlInbox;
}): (request: Request) => Promise<Response> {
  return async (request: Request) => {
    const url = new URL(request.url);
    const token = url.searchParams.get("token");
    if (!token) {
      return new Response("Missing token", { status: 400 });
    }
    const parsed = verifyFeedbackToken(token, options.secret);
    if (!parsed) {
      return new Response("Invalid or expired token", { status: 401 });
    }
    const record = await options.inbox().get(parsed.requestId);
    if (!record) {
      return new Response("Request not found", { status: 404 });
    }
    const def = actionById(record.actions, parsed.actionId);
    if (!def) {
      return new Response("Unknown action", { status: 400 });
    }
    const fields = actionFields(def);
    const html = buildFeedbackFormHtml({
      fields,
      token,
      submitUrl: LINE_FEEDBACK_PATH,
      title: def.label ?? def.id,
    });
    return new Response(html, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
  };
}
