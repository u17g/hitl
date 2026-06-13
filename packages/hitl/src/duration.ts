/** Duration accepted by `waitForHuman({ timeout })`: `"2w"`, `"7d"`, `"72h"`, `"30m"`, `"10s"`, or milliseconds. */
export type Duration = number | `${number}w` | `${number}d` | `${number}h` | `${number}m` | `${number}s`;

const UNIT_MS = { w: 604_800_000, d: 86_400_000, h: 3_600_000, m: 60_000, s: 1_000 } as const;

export function parseDuration(duration: Duration | string): number {
  if (typeof duration === "number") return duration;

  const match = /^(\d+(?:\.\d+)?)(w|d|h|m|s)$/.exec(duration);
  if (!match) {
    throw new Error(`Invalid duration: "${duration}" (expected e.g. "2w", "7d", "72h", "30m", "10s")`);
  }
  const [, value, unit] = match;
  return Number(value) * UNIT_MS[unit as keyof typeof UNIT_MS];
}
