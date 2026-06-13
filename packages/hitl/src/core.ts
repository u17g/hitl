import type {
  CreateBatchBody,
  CreateBatchResponse,
  CreateRequestBody,
  CreateRequestResponse,
  RemindBody,
  RemindResponse,
} from "./api-types";
import type { HitlResolver } from "./binding";
import type { HitlField } from "./fields";
import { DEFAULT_ESCALATE_MESSAGE, DEFAULT_REMIND_MESSAGE } from "./reminder";
import type { ApprovalRecord, BatchRecord, State } from "./state";
import type {
  ApprovalResult,
  BatchApprovalRequest,
  HitlBatchCallback,
  HitlCallback,
  HitlPlugin,
  Notification,
} from "./types";
import { validateFeedbacks } from "./validate";

/**
 * Everything the server-side services need: persistence, channel plugins, and
 * the engine resolver. Workflows never see this — they talk to these services
 * through the `.well-known/hitldev/v1` HTTP API.
 */
export interface HitlRuntime {
  state: State;
  plugins: HitlPlugin[];
  resolver: HitlResolver;
}

/** Unknown approval/batch id; the HTTP layer maps it to 404. */
export class NotFoundError extends Error {
  override name = "NotFoundError";
}

export function pickPlugin(plugins: HitlPlugin[], channel?: string): HitlPlugin {
  if (plugins.length === 0) {
    throw new Error("No hitldev plugins configured. Pass at least one to new Hitl().");
  }
  if (channel === undefined) return plugins[0]!;
  const plugin = plugins.find((p) => p.id === channel);
  if (!plugin) {
    const known = plugins.map((p) => p.id).join(", ");
    throw new Error(`Unknown channel "${channel}". Configured plugins: ${known}`);
  }
  return plugin;
}

/**
 * `POST /requests`: record the approval and deliver it via the plugin.
 * Idempotent on the resume token — the workflow's durable fetch is
 * at-least-once, and a duplicate must not post a second channel message.
 */
export async function createApprovalRequest(
  runtime: HitlRuntime,
  body: CreateRequestBody,
): Promise<CreateRequestResponse> {
  const plugin = pickPlugin(runtime.plugins, body.channel);

  const existing = await runtime.state.findByToken(body.token);
  if (existing) {
    // A retry that finds the record without an externalId crashed between
    // create and send on the previous attempt; finish the delivery.
    if (!existing.externalId) {
      await deliverApproval(runtime, pickPlugin(runtime.plugins, existing.channel), existing);
    }
    return { id: existing.id };
  }

  const id = crypto.randomUUID();
  const record = {
    id,
    token: body.token,
    channel: plugin.id,
    message: body.message,
    fields: body.fields,
  };
  await runtime.state.create(record);
  await deliverApproval(runtime, plugin, record);
  return { id };
}

async function deliverApproval(
  runtime: HitlRuntime,
  plugin: HitlPlugin,
  record: { id: string; channel: string; message: string; fields: Record<string, HitlField> },
): Promise<void> {
  const { externalId } = await plugin.send({
    id: record.id,
    channel: record.channel,
    message: record.message,
    fields: record.fields,
  });
  await runtime.state.setExternalId(record.id, externalId);
}

function resolvedDefaults(fields: Record<string, HitlField>): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(fields)) {
    if (field.default !== undefined) values[key] = field.default;
  }
  return values;
}

function toBatchRequest(
  batch: { id: string; channel: string; title?: string },
  fields: Record<string, HitlField>,
  items: ReadonlyArray<{ id: string; message: string; fields: Record<string, HitlField> }>,
): BatchApprovalRequest {
  return {
    batchId: batch.id,
    channel: batch.channel,
    title: batch.title,
    fields,
    items: items.map((item) => ({
      id: item.id,
      message: item.message,
      defaults: resolvedDefaults(item.fields),
    })),
  };
}

function canDeliverBatch(plugin: HitlPlugin, request: BatchApprovalRequest): boolean {
  return plugin.sendBatch !== undefined && (plugin.canSendBatch?.(request) ?? true);
}

/**
 * `POST /batches`: record the batch and deliver it — one message via
 * `sendBatch` when the plugin supports it, otherwise one `send` per item.
 * Idempotent on the first item's resume token.
 */
export async function createBatchRequest(
  runtime: HitlRuntime,
  body: CreateBatchBody,
): Promise<CreateBatchResponse> {
  if (body.items.length === 0) {
    throw new Error("waitForBatchApprovals needs at least one item.");
  }
  const plugin = pickPlugin(runtime.plugins, body.channel);

  const existing = await runtime.state.findByToken(body.items[0]!.token);
  if (existing?.batchId) {
    const items = await runtime.state.listByBatch(existing.batchId);
    return { batchId: existing.batchId, ids: items.map((r) => r.id) };
  }

  const batchId = crypto.randomUUID();
  const items = body.items.map((item, index) => ({
    id: `${batchId}:${index}`,
    message: item.message,
    fields: item.fields,
  }));

  await runtime.state.createBatch({ id: batchId, channel: plugin.id, title: body.title });
  for (const [index, item] of items.entries()) {
    await runtime.state.create({
      id: item.id,
      token: body.items[index]!.token,
      channel: plugin.id,
      message: item.message,
      fields: item.fields,
      batchId,
      batchIndex: index,
    });
  }

  const request = toBatchRequest({ id: batchId, channel: plugin.id, title: body.title }, body.fields, items);
  if (canDeliverBatch(plugin, request)) {
    const { externalId } = await plugin.sendBatch!(request);
    await runtime.state.setBatchExternalId(batchId, externalId);
  } else {
    for (const item of items) {
      await deliverApproval(runtime, plugin, { ...item, channel: plugin.id });
    }
  }

  return { batchId, ids: items.map((item) => item.id) };
}

/**
 * `POST /requests/:id/timeout`: resolve as TIMED_OUT if still pending. The
 * state's conditional resolve is the atomicity guard — when a callback wins
 * the race, the stored result is returned instead.
 */
export async function timeoutApproval(runtime: HitlRuntime, id: string): Promise<ApprovalResult> {
  const record = await runtime.state.get(id);
  if (!record) throw new NotFoundError(`Unknown approval "${id}"`);
  if (record.status === "resolved" && record.result) return record.result;

  const result: ApprovalResult = { type: "TIMED_OUT", id };
  try {
    await runtime.state.resolve(id, result);
  } catch {
    const winner = await runtime.state.get(id);
    if (winner?.result) return winner.result;
    throw new Error(`Approval "${id}" could not be resolved as timed out`);
  }
  await updateChannels(runtime, record, result);
  return result;
}

/** `POST /batches/:batchId/timeout`: per-item `timeoutApproval` semantics, results in item order. */
export async function timeoutBatch(runtime: HitlRuntime, batchId: string): Promise<ApprovalResult[]> {
  const batch = await runtime.state.getBatch(batchId);
  if (!batch) throw new NotFoundError(`Unknown batch "${batchId}"`);
  const items = await runtime.state.listByBatch(batchId);

  const results: ApprovalResult[] = [];
  for (const item of items) {
    if (item.status === "resolved" && item.result) {
      results.push(item.result);
      continue;
    }
    const result: ApprovalResult = { type: "TIMED_OUT", id: item.id };
    try {
      await runtime.state.resolve(item.id, result);
      results.push(result);
    } catch {
      const winner = await runtime.state.get(item.id);
      results.push(winner?.result ?? result);
    }
  }

  await updateBatchChannels(runtime, batch, items, results);
  return results;
}

/**
 * `POST /requests/:id/remind`: remind or escalate — only while the approval is
 * still pending. The pending check and the action live on the server so they
 * cannot race a callback arriving in between workflow steps.
 */
export async function remindApproval(
  runtime: HitlRuntime,
  id: string,
  body: RemindBody,
): Promise<RemindResponse> {
  const record = await runtime.state.get(id);
  if (!record) throw new NotFoundError(`Unknown approval "${id}"`);
  if (record.status === "resolved") return { pending: false };

  if (body.kind === "escalate" && (body.mode ?? "notify") === "redeliver") {
    const escalatePlugin = pickPlugin(runtime.plugins, body.channel);
    const { externalId } = await escalatePlugin.send({
      id: record.id,
      channel: body.channel,
      message: record.message,
      fields: record.fields,
    });
    await runtime.state.setExternalId(record.id, externalId, body.channel);
    return { pending: true };
  }

  await sendReminderNotification(runtime, body, {
    parent: id,
    primaryChannel: record.channel,
    parentExternalId: record.externalId,
  });
  return { pending: true };
}

/** `POST /batches/:batchId/remind`: like `remindApproval` for a whole batch. */
export async function remindBatch(
  runtime: HitlRuntime,
  batchId: string,
  body: RemindBody,
): Promise<RemindResponse> {
  const batch = await runtime.state.getBatch(batchId);
  if (!batch) throw new NotFoundError(`Unknown batch "${batchId}"`);
  const items = await runtime.state.listByBatch(batchId);
  if (!items.some((item) => item.status === "pending")) return { pending: false };

  if (body.kind === "escalate" && (body.mode ?? "notify") === "redeliver") {
    await redeliverBatch(runtime, batch, items, body.channel);
    return { pending: true };
  }

  await sendReminderNotification(runtime, body, {
    parent: batchId,
    primaryChannel: batch.channel,
    // Per-item fallback delivery: thread under the first item's message.
    parentExternalId: batch.externalId ?? items[0]?.externalId,
  });
  return { pending: true };
}

async function sendReminderNotification(
  runtime: HitlRuntime,
  body: RemindBody,
  ctx: { parent: string; primaryChannel: string; parentExternalId: string | undefined },
): Promise<void> {
  const escalate = body.kind === "escalate";
  const plugin = pickPlugin(runtime.plugins, escalate ? body.channel : ctx.primaryChannel);
  const notification: Notification = {
    message: body.message ?? (escalate ? DEFAULT_ESCALATE_MESSAGE : DEFAULT_REMIND_MESSAGE),
    channel: plugin.id,
    parent: ctx.parent,
  };
  if (ctx.parentExternalId) notification.parentExternalId = ctx.parentExternalId;
  await plugin.notify(notification);
}

/** Re-send the batch approval UI on an escalation channel; reconstructed from the stored records. */
async function redeliverBatch(
  runtime: HitlRuntime,
  batch: BatchRecord,
  items: ApprovalRecord[],
  channel: string,
): Promise<void> {
  const escalatePlugin = pickPlugin(runtime.plugins, channel);
  // The shared schema is not stored; the first item's merged fields render identically.
  const request = toBatchRequest(
    { id: batch.id, channel, title: batch.title },
    items[0]?.fields ?? {},
    items,
  );
  if (canDeliverBatch(escalatePlugin, request)) {
    const { externalId } = await escalatePlugin.sendBatch!(request);
    await runtime.state.setBatchExternalId(batch.id, externalId, channel);
    return;
  }
  for (const item of items) {
    const { externalId } = await escalatePlugin.send({
      id: item.id,
      channel,
      message: item.message,
      fields: item.fields,
    });
    await runtime.state.setExternalId(item.id, externalId, channel);
  }
}

async function updateChannels(
  runtime: HitlRuntime,
  record: ApprovalRecord,
  result: ApprovalResult,
): Promise<void> {
  const pluginIds = new Set<string>();
  if (record.externalId) pluginIds.add(record.channel);
  if (record.externalIds) {
    for (const pluginId of Object.keys(record.externalIds)) {
      pluginIds.add(pluginId);
    }
  }

  for (const pluginId of pluginIds) {
    const channelPlugin = runtime.plugins.find((p) => p.id === pluginId);
    const externalId =
      record.externalIds?.[pluginId] ??
      (pluginId === record.channel ? record.externalId : undefined);
    if (channelPlugin?.update && externalId) {
      await channelPlugin.update(externalId, result);
    }
  }
}

/**
 * Resolver side: called when a channel callback arrives. Validates feedbacks
 * against the stored field definitions, resumes the engine wait by its stored
 * token, and reflects the outcome back into the channel.
 */
export async function resolveApproval(
  runtime: HitlRuntime,
  callback: HitlCallback,
): Promise<ApprovalResult> {
  const record = await runtime.state.get(callback.requestId);
  if (!record) throw new NotFoundError(`Unknown approval "${callback.requestId}"`);

  const result = toResult(record.id, record.fields, callback);

  await runtime.state.resolve(record.id, result);
  await runtime.resolver.resolve(record.token, result);

  await updateChannels(runtime, record, result);
  return result;
}

/**
 * Resolver side: called when a batch submit arrives. Validates every decision
 * before resolving anything — one invalid item rejects the whole submit and
 * leaves every item pending. Already-resolved items keep their stored result.
 */
export async function resolveBatchApproval(
  runtime: HitlRuntime,
  callback: HitlBatchCallback,
): Promise<ApprovalResult[]> {
  const batch = await runtime.state.getBatch(callback.batchId);
  if (!batch) throw new NotFoundError(`Unknown batch "${callback.batchId}"`);
  const items = await runtime.state.listByBatch(callback.batchId);

  const planned = items.map((item) => {
    if (item.status === "resolved" && item.result) {
      return { item, result: item.result, skip: true };
    }
    const decision = callback.decisions.find((d) => d.requestId === item.id);
    if (!decision) {
      throw new Error(`Missing decision for batch item "${item.id}"`);
    }
    return {
      item,
      result: toResult(item.id, item.fields, {
        requestId: item.id,
        decision: decision.decision,
        reason: decision.reason,
        feedbacks: decision.feedbacks,
        by: callback.by,
      }),
      skip: false,
    };
  });

  for (const { item, result, skip } of planned) {
    if (skip) continue;
    await runtime.state.resolve(item.id, result);
    await runtime.resolver.resolve(item.token, result);
  }

  const results = planned.map((p) => p.result);
  await updateBatchChannels(runtime, batch, items, results);
  return results;
}

async function updateBatchChannels(
  runtime: HitlRuntime,
  batch: BatchRecord,
  items: ApprovalRecord[],
  results: ApprovalResult[],
): Promise<void> {
  const pluginIds = new Set<string>();
  if (batch.externalId) pluginIds.add(batch.channel);
  for (const pluginId of Object.keys(batch.externalIds ?? {})) {
    pluginIds.add(pluginId);
  }
  for (const pluginId of pluginIds) {
    const plugin = runtime.plugins.find((p) => p.id === pluginId);
    const externalId =
      batch.externalIds?.[pluginId] ??
      (pluginId === batch.channel ? batch.externalId : undefined);
    if (plugin?.updateBatch && externalId) {
      await plugin.updateBatch(externalId, results);
    }
  }

  // Per-item messages exist on the fallback path and for per-item re-deliveries.
  for (const [index, item] of items.entries()) {
    await updateChannels(runtime, item, results[index]!);
  }
}

function toResult(
  id: string,
  fields: Record<string, HitlField>,
  callback: HitlCallback,
): ApprovalResult {
  if (callback.decision === "deny") {
    return { type: "DENIED", id, by: callback.by, reason: callback.reason };
  }
  if (callback.feedbacks !== undefined && Object.keys(fields).length > 0) {
    const validated = validateFeedbacks(fields, callback.feedbacks);
    if (!equalsDefaults(fields, validated)) {
      return { type: "REVIEWED", id, by: callback.by, feedbacks: validated };
    }
  }
  return { type: "APPROVED", id, by: callback.by };
}

/** Channels send the full form state; untouched values are not edits. */
function equalsDefaults(
  fields: Record<string, HitlField>,
  values: Record<string, unknown>,
): boolean {
  return Object.entries(fields).every(([key, field]) => values[key] === field.default);
}

/**
 * `POST /notifications` and server-internal notifies. `parent` may name an
 * approval or a batch; it resolves to the channel message id to thread under.
 */
export async function notifyVia(
  runtime: HitlRuntime,
  notification: Notification,
): Promise<void> {
  const plugin = pickPlugin(runtime.plugins, notification.channel);
  const enriched: Notification = { ...notification };
  if (notification.parent && !notification.parentExternalId) {
    const externalId = await parentExternalId(runtime.state, notification.parent);
    if (externalId) enriched.parentExternalId = externalId;
  }
  await plugin.notify(enriched);
}

async function parentExternalId(state: State, parent: string): Promise<string | undefined> {
  const batch = await state.getBatch(parent);
  if (batch?.externalId) return batch.externalId;
  const record = await state.get(parent);
  if (record?.externalId) return record.externalId;
  // Per-item fallback delivery: thread under the first item's message.
  const items = await state.listByBatch(parent);
  return items[0]?.externalId;
}
