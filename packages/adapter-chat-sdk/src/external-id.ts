/**
 * externalId encoding for chat plugins. The hitldev core hands plugins only an
 * opaque externalId string on update/notify, so we pack the Chat SDK channel ref
 * and message id into one value. The channel ref itself contains ":" (e.g.
 * "slack:C123"), so we join with "#", which channel/message ids do not use.
 */
const SEPARATOR = "#";

export function encodeExternalId(channel: string, messageId: string): string {
  return `${channel}${SEPARATOR}${messageId}`;
}

export function decodeExternalId(externalId: string): { channel: string; messageId: string } {
  const at = externalId.indexOf(SEPARATOR);
  return {
    channel: externalId.slice(0, at),
    messageId: externalId.slice(at + 1),
  };
}

/** The Chat SDK thread ref ("adapter:channel:threadTs") for a parent message. */
export function threadRef(externalId: string): string {
  const { channel, messageId } = decodeExternalId(externalId);
  return `${channel}:${messageId}`;
}
