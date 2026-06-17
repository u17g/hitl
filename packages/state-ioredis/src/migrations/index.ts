import { migration001Initial } from "./001-initial.js";
import { migration002SortedIndexes } from "./002-sorted-indexes.js";
import { migration003NamespaceIndexes } from "./003-namespace-indexes.js";
import type { Migration } from "./types.js";

/** Ordered, append-only migrations. Add new files and entries here. */
export const MIGRATIONS: readonly Migration[] = [
  migration001Initial,
  migration002SortedIndexes,
  migration003NamespaceIndexes,
];

export const SCHEMA_VERSION = MIGRATIONS.length;

export type { Migration, RedisMigrationContext, RedisMigrator } from "./types.js";
