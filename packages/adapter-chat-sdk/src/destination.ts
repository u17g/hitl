import { decodeExternalId, toChatThreadRef } from "./external-id";

/** Chat SDK channel ref from a destination or thread ref string. */
export function channelFromDestination(dest: string): string {
  if (dest.includes("#")) return decodeExternalId(dest).channel;
  const parts = dest.split(":");
  if (parts.length >= 3) return `${parts[0]}:${parts[1]}`;
  return dest;
}

export function isThreadDestination(dest: string): boolean {
  if (dest.includes("#")) return true;
  return dest.split(":").length >= 3;
}

export function threadDestination(dest: string): string {
  return toChatThreadRef(dest);
}
