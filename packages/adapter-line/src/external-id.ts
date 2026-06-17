const SEPARATOR = "#";

export function encodeExternalId(destination: string, messageId: string): string {
  return `${destination}${SEPARATOR}${messageId}`;
}

export function decodeExternalId(externalId: string): { destination: string; messageId: string } {
  const at = externalId.indexOf(SEPARATOR);
  if (at === -1) {
    throw new Error(`Invalid LINE externalId: ${externalId}`);
  }
  return {
    destination: externalId.slice(0, at),
    messageId: externalId.slice(at + 1),
  };
}
