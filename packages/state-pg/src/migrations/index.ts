import { migration001Initial } from "./001-initial.js";
import { migration002ExternalIds } from "./002-external-ids.js";
import { migration003Batches } from "./003-batches.js";
import type { Migration } from "./types.js";

/** Ordered, append-only migrations. Add new files and entries here. */
export const MIGRATIONS: readonly Migration[] = [
  migration001Initial,
  migration002ExternalIds,
  migration003Batches,
];

export const SCHEMA_VERSION = MIGRATIONS.length;

export type { Migration, MigrationContext } from "./types.js";
