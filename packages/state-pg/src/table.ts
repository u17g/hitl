export const DEFAULT_TABLE = "hitl.human_requests";

const IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const QUALIFIED = /^[a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_]*)?$/;

export interface ResolvedTable {
  tableName: string;
  sql: string;
  indexName: string;
  /** Companion table grouping batch items, e.g. `hitl.human_requests_batches`. */
  batchesSql: string;
  batchIdIndexName: string;
  timelineSql: string;
  timelineThreadIndexName: string;
  /** Notify delivery records for thread anchor chains. */
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
      sql: `${schema}.${table}`,
      indexName: `${schema}_${table}_external_id_idx`,
      batchesSql: `${schema}.${table}_batches`,
      batchIdIndexName: `${schema}_${table}_batch_id_idx`,
      timelineSql: `${schema}.${table}_timeline`,
      timelineThreadIndexName: `${schema}_${table}_timeline_thread_idx`,
      notifyDeliveriesSql: `${schema}.${table}_notify_deliveries`,
      schema,
      table,
    };
  }

  assertIdentifier(tableName);
  return {
    tableName,
    sql: tableName,
    indexName: `${tableName}_external_id_idx`,
    batchesSql: `${tableName}_batches`,
    batchIdIndexName: `${tableName}_batch_id_idx`,
    timelineSql: `${tableName}_timeline`,
    timelineThreadIndexName: `${tableName}_timeline_thread_idx`,
    notifyDeliveriesSql: `${tableName}_notify_deliveries`,
    table: tableName,
  };
}

export function metaTableSql(table: ResolvedTable): string {
  return table.schema ? `${table.schema}.schema_migrations` : "_hitl_schema_migrations";
}

function assertIdentifier(name: string): void {
  if (!IDENTIFIER.test(name)) {
    throw new Error(`Invalid table name "${name}"`);
  }
}
