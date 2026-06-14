export interface HitlToken {
  workflowId: string;
  waitToken: string;
}

export function encodeHitlToken(workflowId: string, waitToken: string): string {
  return JSON.stringify({ workflowId, waitToken } satisfies HitlToken);
}

export function decodeHitlToken(token: string): HitlToken {
  const parsed = JSON.parse(token) as Partial<HitlToken>;
  if (!parsed.workflowId || !parsed.waitToken) {
    throw new Error(`Invalid hitl token: ${token}`);
  }
  return { workflowId: parsed.workflowId, waitToken: parsed.waitToken };
}
