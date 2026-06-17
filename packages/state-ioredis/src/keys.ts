export const DEFAULT_TABLE = "hitl.human_requests";

/** Redis key prefix derived from the default table name. */
export const DEFAULT_PREFIX = "hitl:human_requests";

const IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const QUALIFIED = /^[a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_]*)?$/;

export interface ResolvedKeyPrefix {
  tableName: string;
  prefix: string;
  req(id: string): string;
  idxToken(token: string): string;
  idxExt(externalId: string): string;
  /** ZSET of request ids scored by `createdAt` (ms); powers newest-first `list`. */
  idxStatus(status: "pending" | "resolved"): string;
  /** ZSET of all request ids scored by `createdAt` (ms); powers unfiltered `list`. */
  idxAllReq(): string;
  batch(id: string): string;
  idxBatchExt(externalId: string): string;
  idxBatchItems(batchId: string): string;
  timelineEntry(id: string): string;
  timelineThread(threadId: string): string;
  notify(id: string): string;
  idxNotifyExt(externalId: string): string;
  metaMigrations(): string;
}

export function resolveKeyPrefix(tableName: string): ResolvedKeyPrefix {
  if (!QUALIFIED.test(tableName)) {
    throw new Error(`Invalid table name "${tableName}"`);
  }

  let prefix: string;
  if (tableName.includes(".")) {
    const parts = tableName.split(".");
    const schema = parts[0];
    const table = parts[1];
    if (!schema || !table || parts.length !== 2) {
      throw new Error(`Invalid table name "${tableName}"`);
    }
    assertIdentifier(schema);
    assertIdentifier(table);
    prefix = `${schema}:${table}`;
  } else {
    assertIdentifier(tableName);
    prefix = tableName;
  }

  return {
    tableName,
    prefix,
    req: (id) => `${prefix}:req:${id}`,
    idxToken: (token) => `${prefix}:idx:token:${token}`,
    idxExt: (externalId) => `${prefix}:idx:ext:${externalId}`,
    idxStatus: (status) => `${prefix}:idx:status:${status}`,
    idxAllReq: () => `${prefix}:idx:all:req`,
    batch: (id) => `${prefix}:batch:${id}`,
    idxBatchExt: (externalId) => `${prefix}:idx:batch:ext:${externalId}`,
    idxBatchItems: (batchId) => `${prefix}:idx:batch:${batchId}`,
    timelineEntry: (id) => `${prefix}:timeline:entry:${id}`,
    timelineThread: (threadId) => `${prefix}:timeline:${threadId}`,
    notify: (id) => `${prefix}:notify:${id}`,
    idxNotifyExt: (externalId) => `${prefix}:idx:notify:ext:${externalId}`,
    metaMigrations: () => `${prefix}:meta:migrations`,
  };
}

function assertIdentifier(name: string): void {
  if (!IDENTIFIER.test(name)) {
    throw new Error(`Invalid table name "${name}"`);
  }
}
