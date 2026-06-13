import { migration001Initial } from "./001-initial.js";
import type { Migration } from "./types.js";

/** Ordered, append-only migrations. Add new files and entries here. */
export const MIGRATIONS: readonly Migration[] = [migration001Initial];

export const SCHEMA_VERSION = MIGRATIONS.length;

export type { Migration, RedisMigrationContext, RedisMigrator } from "./types.js";
