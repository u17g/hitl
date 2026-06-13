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
import {
  actionById,
  actionFields,
  defaultsActionId,
  approveFields,
  type HumanActions,
} from "./human-actions";
import type { HumanResult } from "./human-result";
import { DEFAULT_ESCALATE_MESSAGE, DEFAULT_REMIND_MESSAGE } from "./reminder";
import type { TimelineEntry } from "./timeline";
import type { HumanRequestRecord, BatchRecord, State } from "./state";
import type {
  BatchHumanRequest,
  HitlBatchCallback,
  HitlCallback,
  HitlAdapter,
  Notification,
} from "./types";
import { validateFeedbacks } from "./validate";

/**
 * Everything the server-side services need: persistence, channel adapters, and
 * the engine resolver. Workflows never see this — they talk to these services
 * through the `.well-known/hitl/v1` HTTP API.
 */
export interface HitlRuntime {
  state: State;
  adapters: HitlAdapter[];
  resolver: HitlResolver;
}

/** Unknown human request/batch id; the HTTP layer maps it to 404. */
export class NotFoundError extends Error {
  override name = "NotFoundError";
}

export function pickAdapter(adapters: HitlAdapter[], channel?: string): HitlAdapter {
  if (adapters.length === 0) {
    throw new Error("No hitl adapters configured. Pass at least one to new Hitl().");
  }
  if (channel === undefined) return adapters[0]!;
  const adapter = adapters.find((p) => p.id === channel);
  if (!adapter) {
    const known = adapters.map((p) => p.id).join(", ");
    throw new Error(`Unknown channel "${channel}". Configured adapters: ${known}`);
  }
  return adapter;
}

/** Merge per-item defaults into the defaults action's field definitions. */
export function mergeItemActions(
  actions: HumanActions,
  defaults: Record<string, unknown> | undefined,
  defaultsFor?: string,
): HumanActions {
  const targetId = defaultsActionId(actions, defaultsFor);
  const def = actionById(actions, targetId);
  if (!def) return actions;
  const fields = actionFields(def);
  if (!defaults || Object.keys(fields).length === 0) return actions;
  const mergedFields: Record<string, HitlField> = {};
  for (const [key, field] of Object.entries(fields)) {
    const override = defaults[key];
    mergedFields[key] = override === undefined ? field : ({ ...field, default: override } as HitlField);
  }
  return actions.map((a) =>
    a.id === targetId ? { ...a, fields: mergedFields } : a,
  ) as HumanActions;
}

/**
 * `POST /requests`: record the human request and deliver it via the adapter.
 * Idempotent on the resume token — the workflow's durable fetch is
 * at-least-once, and a duplicate must not post a second channel message.
 */
export async function createHumanRequest(
  runtime: HitlRuntime,
  body: CreateRequestBody,
): Promise<CreateRequestResponse> {
  const adapter = pickAdapter(runtime.adapters, body.channel);

  const existing = await runtime.state.findByToken(body.token);
  if (existing) {
    if (!existing.externalId) {
      await deliverHumanRequest(runtime, pickAdapter(runtime.adapters, existing.channel), existing);
    }
    return { id: existing.id };
  }

  const id = crypto.randomUUID();
  const record = {
    id,
    token: body.token,
    channel: adapter.id,
    message: body.message,
    actions: body.actions,
    context: body.context,
  };
  await runtime.state.create(record);
  await deliverHumanRequest(runtime, adapter, record);
  return { id };
}

async function deliverHumanRequest(
  runtime: HitlRuntime,
  adapter: HitlAdapter,
  record: {
    id: string;
    channel: string;
    message: string;
    actions: HumanActions;
    context?: Record<string, unknown>;
  },
): Promise<void> {
  const { externalId } = await adapter.send({
    id: record.id,
    channel: record.channel,
    message: record.message,
    actions: record.actions,
    context: record.context,
  });
  await runtime.state.setExternalId(record.id, externalId);
}

function resolvedDefaults(actions: HumanActions): Record<string, unknown> {
  const fields = approveFields(actions);
  const values: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(fields)) {
    if (field.default !== undefined) values[key] = field.default;
  }
  return values;
}

function toBatchRequest(
  batch: { id: string; channel: string; message?: string; context?: Record<string, unknown> },
  actions: HumanActions,
  items: ReadonlyArray<{ id: string; message: string; actions: HumanActions }>,
): BatchHumanRequest {
  return {
    batchId: batch.id,
    channel: batch.channel,
    message: batch.message,
    actions,
    context: batch.context,
    items: items.map((item) => ({
      id: item.id,
      message: item.message,
      defaults: resolvedDefaults(item.actions),
    })),
  };
}

function canDeliverBatch(adapter: HitlAdapter, request: BatchHumanRequest): boolean {
  return adapter.sendBatch !== undefined && (adapter.canSendBatch?.(request) ?? true);
}

/**
 * `POST /batches`: record the batch and deliver it — one message via
 * `sendBatch` when the adapter supports it, otherwise one `send` per item.
 * Idempotent on the first item's resume token.
 */
export async function createBatchRequest(
  runtime: HitlRuntime,
  body: CreateBatchBody,
): Promise<CreateBatchResponse> {
  if (body.items.length === 0) {
    throw new Error("waitForHuman needs at least one item.");
  }
  const adapter = pickAdapter(runtime.adapters, body.channel);

  const existing = await runtime.state.findByToken(body.items[0]!.token);
  if (existing?.batchId) {
    const items = await runtime.state.listByBatch(existing.batchId);
    return { batchId: existing.batchId, ids: items.map((r) => r.id) };
  }

  const batchId = crypto.randomUUID();
  const items = body.items.map((item, index) => ({
    id: `${batchId}:${index}`,
    message: item.message,
    actions: mergeItemActions(body.actions, item.defaults, body.defaultsActionId),
  }));

  await runtime.state.createBatch({
    id: batchId,
    channel: adapter.id,
    message: body.message,
    actions: body.actions,
    context: body.context,
  });
  for (const [index, item] of items.entries()) {
    await runtime.state.create({
      id: item.id,
      token: body.items[index]!.token,
      channel: adapter.id,
      message: item.message,
      actions: item.actions,
      context: body.context,
      batchId,
      batchIndex: index,
    });
  }

  const request = toBatchRequest(
    { id: batchId, channel: adapter.id, message: body.message, context: body.context },
    body.actions,
    items,
  );
  if (canDeliverBatch(adapter, request)) {
    const { externalId } = await adapter.sendBatch!(request);
    await runtime.state.setBatchExternalId(batchId, externalId);
  } else {
    for (const item of items) {
      await deliverHumanRequest(runtime, adapter, { ...item, channel: adapter.id, context: body.context });
    }
  }

  return { batchId, ids: items.map((item) => item.id) };
}

export async function timeoutHumanRequest(runtime: HitlRuntime, id: string): Promise<HumanResult> {
  const record = await runtime.state.get(id);
  if (!record) throw new NotFoundError(`Unknown human request "${id}"`);
  if (record.status === "resolved" && record.result) return record.result;

  const result: HumanResult = { type: "TIMED_OUT", id };
  try {
    await runtime.state.resolve(id, result);
  } catch {
    const winner = await runtime.state.get(id);
    if (winner?.result) return winner.result;
    throw new Error(`Human request "${id}" could not be resolved as timed out`);
  }
  await updateChannels(runtime, record, result);
  return result;
}

export async function timeoutBatch(runtime: HitlRuntime, batchId: string): Promise<HumanResult[]> {
  const batch = await runtime.state.getBatch(batchId);
  if (!batch) throw new NotFoundError(`Unknown batch "${batchId}"`);
  const items = await runtime.state.listByBatch(batchId);

  const results: HumanResult[] = [];
  for (const item of items) {
    if (item.status === "resolved" && item.result) {
      results.push(item.result);
      continue;
    }
    const result: HumanResult = { type: "TIMED_OUT", id: item.id };
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

export async function remindHumanRequest(
  runtime: HitlRuntime,
  id: string,
  body: RemindBody,
): Promise<RemindResponse> {
  const record = await runtime.state.get(id);
  if (!record) throw new NotFoundError(`Unknown human request "${id}"`);
  if (record.status === "resolved") return { pending: false };

  if (body.kind === "escalate" && (body.mode ?? "notify") === "redeliver") {
    const escalateAdapter = pickAdapter(runtime.adapters, body.channel);
    const { externalId } = await escalateAdapter.send({
      id: record.id,
      channel: body.channel,
      message: record.message,
      actions: record.actions,
      context: record.context,
    });
    await runtime.state.setExternalId(record.id, externalId, body.channel);
    return { pending: true };
  }

  await sendReminderNotification(runtime, body, {
    on: id,
    primaryChannel: record.channel,
  });
  return { pending: true };
}

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
    on: batchId,
    primaryChannel: batch.channel,
  });
  return { pending: true };
}

async function sendReminderNotification(
  runtime: HitlRuntime,
  body: RemindBody,
  ctx: { on: string; primaryChannel: string },
): Promise<void> {
  const escalate = body.kind === "escalate";
  const adapter = pickAdapter(runtime.adapters, escalate ? body.channel : ctx.primaryChannel);
  await notifyVia(runtime, {
    message: body.message ?? (escalate ? DEFAULT_ESCALATE_MESSAGE : DEFAULT_REMIND_MESSAGE),
    channel: adapter.id,
    on: ctx.on,
  });
}

async function redeliverBatch(
  runtime: HitlRuntime,
  batch: BatchRecord,
  items: HumanRequestRecord[],
  channel: string,
): Promise<void> {
  const escalateAdapter = pickAdapter(runtime.adapters, channel);
  const actions = batch.actions ?? items[0]?.actions ?? [{ id: "approve" }];
  const request = toBatchRequest(
    { id: batch.id, channel, message: batch.message, context: batch.context },
    actions,
    items.map((item) => ({ id: item.id, message: item.message, actions: item.actions })),
  );
  if (canDeliverBatch(escalateAdapter, request)) {
    const { externalId } = await escalateAdapter.sendBatch!(request);
    await runtime.state.setBatchExternalId(batch.id, externalId, channel);
    return;
  }
  for (const item of items) {
    const { externalId } = await escalateAdapter.send({
      id: item.id,
      channel,
      message: item.message,
      actions: item.actions,
      context: item.context,
    });
    await runtime.state.setExternalId(item.id, externalId, channel);
  }
}

async function updateChannels(
  runtime: HitlRuntime,
  record: HumanRequestRecord,
  result: HumanResult,
): Promise<void> {
  const adapterIds = new Set<string>();
  if (record.externalId) adapterIds.add(record.channel);
  if (record.externalIds) {
    for (const adapterId of Object.keys(record.externalIds)) {
      adapterIds.add(adapterId);
    }
  }

  for (const adapterId of adapterIds) {
    const channelAdapter = runtime.adapters.find((p) => p.id === adapterId);
    const externalId =
      record.externalIds?.[adapterId] ??
      (adapterId === record.channel ? record.externalId : undefined);
    if (channelAdapter?.update && externalId) {
      await channelAdapter.update(externalId, result);
    }
  }
}

export async function resolveHumanRequest(
  runtime: HitlRuntime,
  callback: HitlCallback,
): Promise<HumanResult> {
  const record = await runtime.state.get(callback.requestId);
  if (!record) throw new NotFoundError(`Unknown human request "${callback.requestId}"`);

  const result = toResult(record.id, record.actions, callback);

  await runtime.state.resolve(record.id, result);
  await runtime.resolver.resolve(record.token, result);

  await updateChannels(runtime, record, result);
  return result;
}

export async function resolveBatchHumanRequest(
  runtime: HitlRuntime,
  callback: HitlBatchCallback,
): Promise<HumanResult[]> {
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
      result: toResult(item.id, item.actions, {
        requestId: item.id,
        actionId: decision.actionId,
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
  items: HumanRequestRecord[],
  results: HumanResult[],
): Promise<void> {
  const adapterIds = new Set<string>();
  if (batch.externalId) adapterIds.add(batch.channel);
  for (const adapterId of Object.keys(batch.externalIds ?? {})) {
    adapterIds.add(adapterId);
  }
  for (const adapterId of adapterIds) {
    const adapter = runtime.adapters.find((p) => p.id === adapterId);
    const externalId =
      batch.externalIds?.[adapterId] ??
      (adapterId === batch.channel ? batch.externalId : undefined);
    if (adapter?.updateBatch && externalId) {
      await adapter.updateBatch(externalId, results);
    }
  }

  for (const [index, item] of items.entries()) {
    await updateChannels(runtime, item, results[index]!);
  }
}

function toResult(
  id: string,
  actions: HumanActions,
  callback: HitlCallback,
): HumanResult {
  const def = actionById(actions, callback.actionId);
  if (!def) {
    throw new Error(`Unknown action "${callback.actionId}".`);
  }

  const fields = actionFields(def);
  if (Object.keys(fields).length > 0) {
    const feedbacks = validateFeedbacks(fields, callback.feedbacks ?? {});
    const edited = !equalsDefaults(fields, feedbacks);
    return {
      type: "RESOLVED",
      actionId: callback.actionId,
      id,
      by: callback.by,
      feedbacks,
      ...(edited ? { edited: true } : {}),
    };
  }

  return {
    type: "RESOLVED",
    actionId: callback.actionId,
    id,
    by: callback.by,
    feedbacks: {},
  };
}

function equalsDefaults(
  fields: Record<string, HitlField>,
  values: Record<string, unknown>,
): boolean {
  return Object.entries(fields).every(([key, field]) => values[key] === field.default);
}

export interface NotifyThreadContext {
  threadId: string;
  threadRef: string | undefined;
}

export async function resolveNotifyThread(
  state: State,
  id: string,
): Promise<NotifyThreadContext> {
  const record = await state.get(id);
  if (record?.batchId) {
    const batch = await state.getBatch(record.batchId);
    const items = batch ? await state.listByBatch(record.batchId) : [];
    return {
      threadId: record.batchId,
      threadRef: batch?.externalId ?? record.externalId ?? items[0]?.externalId,
    };
  }
  if (record) {
    return { threadId: id, threadRef: record.externalId };
  }
  const batch = await state.getBatch(id);
  if (batch) {
    const items = await state.listByBatch(id);
    return {
      threadId: id,
      threadRef: batch.externalId ?? items[0]?.externalId,
    };
  }
  return { threadId: id, threadRef: undefined };
}

export async function notifyVia(
  runtime: HitlRuntime,
  notification: Notification,
): Promise<void> {
  const anchorId = notification.after?.id ?? notification.on ?? notification.threadId;
  let threadId = notification.threadId;
  let threadRef = notification.threadRef;

  if (anchorId) {
    const ctx = await resolveNotifyThread(runtime.state, anchorId);
    threadId = ctx.threadId;
    if (!threadRef && ctx.threadRef) threadRef = ctx.threadRef;
  }

  if (threadId) {
    const entry: TimelineEntry = {
      id: crypto.randomUUID(),
      threadId,
      message: notification.message,
      detail: notification.detail,
      createdAt: new Date().toISOString(),
    };
    await runtime.state.appendTimeline(entry);
  }

  const adapter = pickAdapter(runtime.adapters, notification.channel);
  await adapter.notify({
    message: notification.message,
    channel: adapter.id,
    threadId,
    threadRef,
    detail: notification.detail,
  });
}
