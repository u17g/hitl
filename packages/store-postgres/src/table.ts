export const DEFAULT_TABLE = "hitldev.approvals";

const IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const QUALIFIED = /^[a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_]*)?$/;

export interface ResolvedTable {
  tableName: string;
  sql: string;
  indexName: string;
  /** Companion table grouping batch items, e.g. `hitldev.approvals_batches`. */
  batchesSql: string;
  batchIdIndexName: string;
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
    table: tableName,
  };
}

export function metaTableSql(table: ResolvedTable): string {
  return table.schema ? `${table.schema}.schema_migrations` : "_hitldev_schema_migrations";
}

function assertIdentifier(name: string): void {
  if (!IDENTIFIER.test(name)) {
    throw new Error(`Invalid table name "${name}"`);
  }
}
