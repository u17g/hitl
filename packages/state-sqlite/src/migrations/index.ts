import { migration001Initial } from "./001-initial.js";
import { migration002ExternalIds } from "./002-external-ids.js";
import { migration003Batches } from "./003-batches.js";
import { migration004HumanActions } from "./004-human-actions.js";
import { migration005ActionsArray } from "./005-actions-array.js";
import { migration006RenameHumanRequests } from "./006-rename-human-requests.js";
import { migration007RenameBatchTitleToMessage } from "./007-rename-batch-title-to-message.js";
import { migration008NotifyDeliveries } from "./008-notify-deliveries.js";
import type { Migration } from "./types.js";

/** Ordered, append-only migrations. Add new files and entries here. */
export const MIGRATIONS: readonly Migration[] = [
  migration001Initial,
  migration002ExternalIds,
  migration003Batches,
  migration004HumanActions,
  migration005ActionsArray,
  migration006RenameHumanRequests,
  migration007RenameBatchTitleToMessage,
  migration008NotifyDeliveries,
];

export const SCHEMA_VERSION = MIGRATIONS.length;

export type { Migration, MigrationContext } from "./types.js";
