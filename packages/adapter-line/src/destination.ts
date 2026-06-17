export type LineDestinationKind = "user" | "group" | "room";

export interface LineDestination {
  kind: LineDestinationKind;
  /** Full routing ref, e.g. `user:U123`. */
  ref: string;
  /** Push API `to` value (id without kind prefix). */
  to: string;
}

const KINDS: LineDestinationKind[] = ["user", "group", "room"];

export function parseDestination(dest: string): LineDestination {
  const colon = dest.indexOf(":");
  if (colon === -1) {
    throw new Error(`Invalid LINE destination "${dest}"; expected user:, group:, or room: prefix.`);
  }
  const kind = dest.slice(0, colon) as LineDestinationKind;
  if (!KINDS.includes(kind)) {
    throw new Error(`Invalid LINE destination "${dest}"; expected user:, group:, or room: prefix.`);
  }
  const to = dest.slice(colon + 1);
  if (!to) {
    throw new Error(`Invalid LINE destination "${dest}"; missing id after prefix.`);
  }
  return { kind, ref: dest, to };
}

export function destinationFromSource(source: {
  type?: string;
  userId?: string;
  groupId?: string;
  roomId?: string;
}): string | undefined {
  switch (source.type) {
    case "user":
      return source.userId ? `user:${source.userId}` : undefined;
    case "group":
      return source.groupId ? `group:${source.groupId}` : undefined;
    case "room":
      return source.roomId ? `room:${source.roomId}` : undefined;
    default:
      return undefined;
  }
}
