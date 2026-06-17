/** HTTP channel key under `/.well-known/hitl/v1/channels/{channelKey}/`. */
export const LINE_CHANNEL_KEY = "line";

/** Fixed LIFF feedback path. Must stay aligned with `CHANNELS_BASE_PATH` in `@hitl-sdk/hitl/client`. */
export const LINE_FEEDBACK_PATH = "/.well-known/hitl/v1/channels/line/feedback";

/** Postback payload kinds carried in LINE postback `data` (max 300 chars). */

export const POSTBACK_KIND_ACTION = "a";
export const POSTBACK_KIND_FIELD_VALUE = "v";

export const CONFIRM_YES = "yes";
export const CONFIRM_NO = "no";

export interface PostbackPayload {
  k: typeof POSTBACK_KIND_ACTION | typeof POSTBACK_KIND_FIELD_VALUE;
  r: string;
  a: string;
  f?: string;
  v?: string;
}

export function encodePostback(payload: PostbackPayload): string {
  return JSON.stringify(payload);
}

export function parsePostback(data: string): PostbackPayload | undefined {
  try {
    const parsed = JSON.parse(data) as Partial<PostbackPayload>;
    if (
      (parsed.k !== POSTBACK_KIND_ACTION && parsed.k !== POSTBACK_KIND_FIELD_VALUE) ||
      typeof parsed.r !== "string" ||
      typeof parsed.a !== "string"
    ) {
      return undefined;
    }
    return parsed as PostbackPayload;
  } catch {
    return undefined;
  }
}
