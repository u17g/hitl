export const DEFAULT_TABLE = "hitl.human_requests";

const IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const QUALIFIED = /^[a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_]*)?$/;

export interface ResolvedTable {
  tableName: string;
  sql: string;
  indexName: string;
  /** Keyset paging indexes for `list`: `(status, created_at, id)` and `(created_at, id)`. */
  listStatusIndexName: string;
  listCreatedIndexName: string;
  /** Namespace-scoped paging indexes: `(namespace, status, created_at, id)` and `(namespace, created_at, id)`. */
  listNsStatusIndexName: string;
  listNsIndexName: string;
  /** Companion table grouping batch items, e.g. `"hitl.human_requests_batches"`. */
  batchesSql: string;
  batchIdIndexName: string;
  /** Timeline entries for notify and activity under a human step. */
  timelineSql: string;
  timelineThreadIndexName: string;
  notifyDeliveriesSql: string;
  schema?: string;
  table: string;
}

export function resolveTableName(tableName: string): ResolvedTable {
  if (!QUALIFIED.test(tableName)) {
    throw new Error(`Invalid table name "${tableName}"`);
  }

  if (tableName.includes(".")) {
    const parts = tableName.split(".");
    const schema = parts[0];
    const table = parts[1];
    if (!schema || !table || parts.length !== 2) {
      throw new Error(`Invalid table name "${tableName}"`);
    }
    assertIdentifier(schema);
    assertIdentifier(table);
    return {
      tableName,
      sql: `"${schema}.${table}"`,
      indexName: `${schema}_${table}_external_id_idx`,
      listStatusIndexName: `${schema}_${table}_list_status_idx`,
      listCreatedIndexName: `${schema}_${table}_list_created_idx`,
      listNsStatusIndexName: `${schema}_${table}_list_ns_status_idx`,
      listNsIndexName: `${schema}_${table}_list_ns_idx`,
      batchesSql: `"${schema}.${table}_batches"`,
      batchIdIndexName: `${schema}_${table}_batch_id_idx`,
      timelineSql: `"${schema}.${table}_timeline"`,
      timelineThreadIndexName: `${schema}_${table}_timeline_thread_idx`,
      notifyDeliveriesSql: `"${schema}.${table}_notify_deliveries"`,
      schema,
      table,
    };
  }

  assertIdentifier(tableName);
  return {
    tableName,
    sql: tableName,
    indexName: `${tableName}_external_id_idx`,
    listStatusIndexName: `${tableName}_list_status_idx`,
    listCreatedIndexName: `${tableName}_list_created_idx`,
    listNsStatusIndexName: `${tableName}_list_ns_status_idx`,
    listNsIndexName: `${tableName}_list_ns_idx`,
    batchesSql: `${tableName}_batches`,
    batchIdIndexName: `${tableName}_batch_id_idx`,
    timelineSql: `${tableName}_timeline`,
    timelineThreadIndexName: `${tableName}_timeline_thread_idx`,
    notifyDeliveriesSql: `${tableName}_notify_deliveries`,
    table: tableName,
  };
}

export function metaTableSql(table: ResolvedTable): string {
  return table.schema ? `"${table.schema}.schema_migrations"` : "_hitl_schema_migrations";
}

function assertIdentifier(name: string): void {
  if (!IDENTIFIER.test(name)) {
    throw new Error(`Invalid table name "${name}"`);
  }
}
