import type { EngineBinding, EngineSuspension } from "./binding";
import { parseDuration, type Duration } from "./duration";
import type { FeedbackValues, HitlField } from "./fields";
import {
  escalateMessage,
  isEscalate,
  remindMessage,
  type EscalateEntry,
  type ReminderEntry,
  type RemindEntry,
} from "./reminder";
import type { ApprovalRecord, BatchRecord, Store } from "./store";
import type {
  ApprovalResult,
  BatchApprovalRequest,
  HitlBatchCallback,
  HitlCallback,
  HitlPlugin,
  Notification,
} from "./types";
import { validateFeedbacks } from "./validate";

/** Everything the engine-agnostic core needs to operate. Assembled by `createHitl` plus a binding. */
export interface HitlRuntime {
  binding: EngineBinding;
  store: Store;
  plugins: HitlPlugin[];
}

export interface ApprovalOptions<F extends Record<string, HitlField>> {
  message: string;
  fields?: F;
  /** Plugin id; defaults to the first configured plugin. */
  channel?: string;
  /** e.g. "72h"; resolves as { type: "TIMED_OUT" }. */
  timeout?: Duration;
  /** Remind or escalate while pending. `{ after, message }` reminds; `{ after, channel }` escalates. */
  reminder?: ReminderEntry[];
}

export interface BatchApprovalItem<F extends Record<string, HitlField>> {
  message: string;
  /** Overrides the shared field defaults for this item. */
  defaults?: Partial<FeedbackValues<F>>;
}

export interface BatchApprovalOptions<F extends Record<string, HitlField>> {
  /** Heading of the batch message. */
  title?: string;
  /** Field schema shared by every item. */
  fields?: F;
  items: ReadonlyArray<BatchApprovalItem<F>>;
  /** Plugin id; defaults to the first configured plugin. */
  channel?: string;
  /** One timeout for the whole batch; pending items resolve as TIMED_OUT. */
  timeout?: Duration;
  /** Remind or escalate while any item is pending. `{ after, message }` reminds; `{ after, channel }` escalates. */
  reminder?: ReminderEntry[];
}

function pickPlugin(plugins: HitlPlugin[], channel?: string): HitlPlugin {
  if (plugins.length === 0) {
    throw new Error("No hitldev plugins configured. Pass at least one to createHitl().");
  }
  if (channel === undefined) return plugins[0]!;
  const plugin = plugins.find((p) => p.id === channel);
  if (!plugin) {
    const known = plugins.map((p) => p.id).join(", ");
    throw new Error(`Unknown channel "${channel}". Configured plugins: ${known}`);
  }
  return plugin;
}

interface ScheduledReminder {
  entry: ReminderEntry;
  ms: number;
}

function buildReminderSchedule(reminders: ReminderEntry[]): ScheduledReminder[] {
  return reminders
    .map((entry) => ({ entry, ms: parseDuration(entry.after) }))
    .sort((a, b) => a.ms - b.ms || 0);
}

/**
 * Workflow side: record the request, deliver it via the plugin, and suspend
 * until a callback (or the timeout) resolves it.
 */
export async function requestApproval<F extends Record<string, HitlField>>(
  runtime: HitlRuntime,
  opts: ApprovalOptions<F>,
): Promise<ApprovalResult<FeedbackValues<F>>> {
  const plugin = pickPlugin(runtime.plugins, opts.channel);
  const fields = opts.fields ?? {};

  // UUID generation is non-deterministic, so it runs as a step too.
  const id = await runtime.binding.run("hitldev:create-id", async () => crypto.randomUUID());
  const suspension = runtime.binding.suspend<ApprovalResult<FeedbackValues<F>>>();
  await runtime.binding.run("hitldev:record-request", () =>
    runtime.store.create({
      id,
      token: suspension.token,
      channel: plugin.id,
      message: opts.message,
      fields,
    }),
  );

  // Delivery is its own step: a retry of setExternalId must not re-send the message.
  const { externalId } = await runtime.binding.run("hitldev:deliver", () =>
    plugin.send({ id, channel: plugin.id, message: opts.message, fields }),
  );
  await runtime.binding.run("hitldev:store-external-id", () =>
    runtime.store.setExternalId(id, externalId),
  );

  const timeoutMs = opts.timeout === undefined ? undefined : parseDuration(opts.timeout);
  const reminderSchedule = buildReminderSchedule(opts.reminder ?? []);

  if (timeoutMs === undefined && reminderSchedule.length === 0) {
    return suspension.promise;
  }

  const subject = approvalWaitSubject<F>(runtime, {
    id,
    plugin,
    fields: (opts.fields ?? {}) as F,
    message: opts.message,
    suspension,
  });
  return waitWithReminders(runtime, subject, timeoutMs, reminderSchedule);
}

interface PreparedBatchItem {
  id: string;
  message: string;
  /** Shared field schema with this item's defaults merged in. */
  fields: Record<string, HitlField>;
}

function mergeItemFields(
  fields: Record<string, HitlField>,
  defaults: Record<string, unknown> | undefined,
): Record<string, HitlField> {
  const merged: Record<string, HitlField> = {};
  for (const [key, field] of Object.entries(fields)) {
    const override = defaults?.[key];
    merged[key] = override === undefined ? field : ({ ...field, default: override } as HitlField);
  }
  return merged;
}

function resolvedDefaults(fields: Record<string, HitlField>): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(fields)) {
    if (field.default !== undefined) values[key] = field.default;
  }
  return values;
}

function toBatchRequest(
  batchId: string,
  channel: string,
  title: string | undefined,
  fields: Record<string, HitlField>,
  items: PreparedBatchItem[],
): BatchApprovalRequest {
  return {
    batchId,
    channel,
    title,
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

/** One message via `sendBatch` when the plugin supports it, otherwise one `send` per item. */
async function deliverBatch(
  runtime: HitlRuntime,
  plugin: HitlPlugin,
  request: BatchApprovalRequest,
  items: PreparedBatchItem[],
): Promise<void> {
  if (canDeliverBatch(plugin, request)) {
    const { externalId } = await runtime.binding.run("hitldev:deliver", () =>
      plugin.sendBatch!(request),
    );
    await runtime.binding.run("hitldev:store-external-id", () =>
      runtime.store.setBatchExternalId(request.batchId, externalId),
    );
    return;
  }

  for (const item of items) {
    const { externalId } = await runtime.binding.run("hitldev:deliver", () =>
      plugin.send({
        id: item.id,
        channel: request.channel,
        message: item.message,
        fields: item.fields,
      }),
    );
    await runtime.binding.run("hitldev:store-external-id", () =>
      runtime.store.setExternalId(item.id, externalId),
    );
  }
}

/**
 * Workflow side: deliver a list of approvals as a single message (when the
 * channel supports it) and suspend until every item is resolved. Results come
 * back in item order.
 */
export async function requestBatchApprovals<F extends Record<string, HitlField>>(
  runtime: HitlRuntime,
  opts: BatchApprovalOptions<F>,
): Promise<ApprovalResult<FeedbackValues<F>>[]> {
  if (opts.items.length === 0) {
    throw new Error("waitForBatchApprovals needs at least one item.");
  }
  const plugin = pickPlugin(runtime.plugins, opts.channel);
  const fields = opts.fields ?? {};

  const batchId = await runtime.binding.run("hitldev:create-id", async () => crypto.randomUUID());

  const items: PreparedBatchItem[] = opts.items.map((item, index) => ({
    id: `${batchId}:${index}`,
    message: item.message,
    fields: mergeItemFields(fields, item.defaults),
  }));

  // One durable wait per item, created serially: token order must be stable across replays.
  const suspensions = items.map(() =>
    runtime.binding.suspend<ApprovalResult<FeedbackValues<F>>>(),
  );

  await runtime.binding.run("hitldev:record-batch", () =>
    runtime.store.createBatch({ id: batchId, channel: plugin.id, title: opts.title }),
  );
  for (const [index, item] of items.entries()) {
    await runtime.binding.run("hitldev:record-request", () =>
      runtime.store.create({
        id: item.id,
        token: suspensions[index]!.token,
        channel: plugin.id,
        message: item.message,
        fields: item.fields,
        batchId,
        batchIndex: index,
      }),
    );
  }

  const request = toBatchRequest(batchId, plugin.id, opts.title, fields, items);
  await deliverBatch(runtime, plugin, request, items);

  const all = Promise.all(suspensions.map((s) => s.promise));
  const timeoutMs = opts.timeout === undefined ? undefined : parseDuration(opts.timeout);
  const reminderSchedule = buildReminderSchedule(opts.reminder ?? []);

  if (timeoutMs === undefined && reminderSchedule.length === 0) {
    return all;
  }

  const subject = batchWaitSubject<F>(runtime, { batchId, plugin, request, items, all });
  return waitWithReminders(runtime, subject, timeoutMs, reminderSchedule);
}

function batchWaitSubject<F extends Record<string, HitlField>>(
  runtime: HitlRuntime,
  ctx: {
    batchId: string;
    plugin: HitlPlugin;
    request: BatchApprovalRequest;
    items: PreparedBatchItem[];
    all: Promise<ApprovalResult<FeedbackValues<F>>[]>;
  },
): WaitSubject<ApprovalResult<FeedbackValues<F>>[]> {
  return {
    promise: ctx.all,
    parentId: ctx.batchId,
    plugin: ctx.plugin,

    async isPending() {
      const items = await runtime.store.listByBatch(ctx.batchId);
      return items.some((r) => r.status === "pending");
    },

    async parentExternalId() {
      const batch = await runtime.store.getBatch(ctx.batchId);
      if (batch?.externalId) return batch.externalId;
      // Per-item fallback delivery: thread under the first item's message.
      const items = await runtime.store.listByBatch(ctx.batchId);
      return items[0]?.externalId;
    },

    async redeliver(escalatePlugin, channel, index) {
      const request: BatchApprovalRequest = { ...ctx.request, channel };
      if (canDeliverBatch(escalatePlugin, request)) {
        const { externalId } = await runtime.binding.run(
          `hitldev:escalate-redeliver:${index}`,
          () => escalatePlugin.sendBatch!(request),
        );
        await runtime.binding.run(`hitldev:escalate-store-external-id:${index}`, () =>
          runtime.store.setBatchExternalId(ctx.batchId, externalId, channel),
        );
        return;
      }
      for (const item of ctx.items) {
        const { externalId } = await runtime.binding.run(
          `hitldev:escalate-redeliver:${index}`,
          () =>
            escalatePlugin.send({
              id: item.id,
              channel,
              message: item.message,
              fields: item.fields,
            }),
        );
        await runtime.binding.run(`hitldev:escalate-store-external-id:${index}`, () =>
          runtime.store.setExternalId(item.id, externalId, channel),
        );
      }
    },

    finalizeTimeout: () =>
      finalizeBatchTimeout(runtime, ctx.batchId) as Promise<
        ApprovalResult<FeedbackValues<F>>[]
      >,
  };
}

async function finalizeBatchTimeout(
  runtime: HitlRuntime,
  batchId: string,
): Promise<ApprovalResult[]> {
  const records = await runtime.binding.run("hitldev:check-resolution", () =>
    runtime.store.listByBatch(batchId),
  );

  const results: ApprovalResult[] = [];
  for (const record of records) {
    if (record.status === "resolved" && record.result) {
      results.push(record.result);
      continue;
    }
    const result: ApprovalResult = { type: "TIMED_OUT", id: record.id };
    await runtime.binding.run("hitldev:record-timeout", () =>
      runtime.store.resolve(record.id, result),
    );
    results.push(result);
  }

  const batch = await runtime.binding.run("hitldev:get-batch", () =>
    runtime.store.getBatch(batchId),
  );
  await runtime.binding.run("hitldev:update-channel", () =>
    updateBatchChannels(runtime, batch, records, results),
  );
  return results;
}

/**
 * What the reminder/timeout loop needs to know about the thing it is waiting
 * for — a single approval or a whole batch.
 */
interface WaitSubject<T> {
  promise: Promise<T>;
  /** Id used as `parent` when threading notifications. */
  parentId: string;
  /** Primary channel plugin; remind notifications go here. */
  plugin: HitlPlugin;
  /** Store check run inside the reminder-check step. */
  isPending(): Promise<boolean>;
  /** Channel message id notifications should thread under. */
  parentExternalId(): Promise<string | undefined>;
  /** Re-send the approval UI on an escalation channel. */
  redeliver(escalatePlugin: HitlPlugin, channel: string, index: number): Promise<void>;
  finalizeTimeout(): Promise<T>;
}

function approvalWaitSubject<F extends Record<string, HitlField>>(
  runtime: HitlRuntime,
  ctx: {
    id: string;
    plugin: HitlPlugin;
    fields: F;
    message: string;
    suspension: EngineSuspension<ApprovalResult<FeedbackValues<F>>>;
  },
): WaitSubject<ApprovalResult<FeedbackValues<F>>> {
  return {
    promise: ctx.suspension.promise,
    parentId: ctx.id,
    plugin: ctx.plugin,

    async isPending() {
      const record = await runtime.store.get(ctx.id);
      return record?.status === "pending";
    },

    async parentExternalId() {
      return (await runtime.store.get(ctx.id))?.externalId;
    },

    async redeliver(escalatePlugin, channel, index) {
      const { externalId } = await runtime.binding.run(`hitldev:escalate-redeliver:${index}`, () =>
        escalatePlugin.send({
          id: ctx.id,
          channel,
          message: ctx.message,
          fields: ctx.fields,
        }),
      );
      await runtime.binding.run(`hitldev:escalate-store-external-id:${index}`, () =>
        runtime.store.setExternalId(ctx.id, externalId, channel),
      );
    },

    finalizeTimeout: () => finalizeTimeout(runtime, ctx.id, ctx.plugin),
  };
}

async function waitWithReminders<T>(
  runtime: HitlRuntime,
  subject: WaitSubject<T>,
  timeoutMs: number | undefined,
  reminderSchedule: ScheduledReminder[],
): Promise<T> {
  let elapsedMs = 0;
  let reminderIndex = 0;

  while (true) {
    while (reminderIndex < reminderSchedule.length) {
      const next = reminderSchedule[reminderIndex]!;
      if (next.ms > elapsedMs) break;
      if (timeoutMs !== undefined && next.ms >= timeoutMs) {
        reminderIndex++;
        continue;
      }
      await runReminder(runtime, subject, next.entry, reminderIndex);
      reminderIndex++;
    }

    let nextWakeMs = Infinity;
    let wakeKind: "timeout" | "reminder" | undefined;

    if (timeoutMs !== undefined && timeoutMs > elapsedMs) {
      nextWakeMs = timeoutMs - elapsedMs;
      wakeKind = "timeout";
    }

    if (reminderIndex < reminderSchedule.length) {
      const nextReminderMs = reminderSchedule[reminderIndex]!.ms - elapsedMs;
      if (nextReminderMs >= 0 && nextReminderMs < nextWakeMs) {
        nextWakeMs = nextReminderMs;
        wakeKind = "reminder";
      }
    }

    if (wakeKind === undefined) {
      return subject.promise;
    }

    const winner = await Promise.race([
      subject.promise.then((result) => ({ kind: "resolved" as const, result })),
      runtime.binding.sleep(nextWakeMs).then(() => ({ kind: wakeKind! })),
    ]);

    if (winner.kind === "resolved") {
      return winner.result;
    }

    elapsedMs += nextWakeMs;

    if (winner.kind === "timeout") {
      return subject.finalizeTimeout();
    }

    const entry = reminderSchedule[reminderIndex]!.entry;
    await runReminder(runtime, subject, entry, reminderIndex);
    reminderIndex++;
  }
}

async function runReminder<T>(
  runtime: HitlRuntime,
  subject: WaitSubject<T>,
  entry: ReminderEntry,
  index: number,
): Promise<void> {
  const pending = await runtime.binding.run(`hitldev:reminder-check:${index}`, () =>
    subject.isPending(),
  );
  if (!pending) return;

  if (isEscalate(entry)) {
    await runEscalate(runtime, subject, entry, index);
  } else {
    await runRemind(runtime, subject, entry, index);
  }
}

async function runRemind<T>(
  runtime: HitlRuntime,
  subject: WaitSubject<T>,
  entry: RemindEntry,
  index: number,
): Promise<void> {
  await runtime.binding.run(`hitldev:remind:${index}`, async () => {
    const notification: Notification = {
      parent: subject.parentId,
      message: remindMessage(entry),
      channel: subject.plugin.id,
    };
    const externalId = await subject.parentExternalId();
    if (externalId) notification.parentExternalId = externalId;
    await subject.plugin.notify(notification);
  });
}

async function runEscalate<T>(
  runtime: HitlRuntime,
  subject: WaitSubject<T>,
  entry: EscalateEntry,
  index: number,
): Promise<void> {
  const mode = entry.mode ?? "notify";
  const escalatePlugin = pickPlugin(runtime.plugins, entry.channel);

  if (mode === "redeliver") {
    await subject.redeliver(escalatePlugin, entry.channel, index);
    return;
  }

  await runtime.binding.run(`hitldev:escalate-notify:${index}`, async () => {
    const notification: Notification = {
      message: escalateMessage(entry),
      channel: entry.channel,
      parent: subject.parentId,
    };
    const externalId = await subject.parentExternalId();
    if (externalId) notification.parentExternalId = externalId;
    await escalatePlugin.notify(notification);
  });
}

async function finalizeTimeout<F extends Record<string, HitlField>>(
  runtime: HitlRuntime,
  id: string,
  _plugin: HitlPlugin,
): Promise<ApprovalResult<FeedbackValues<F>>> {
  const record = await runtime.binding.run("hitldev:check-resolution", () => runtime.store.get(id));
  if (record?.status === "resolved" && record.result) {
    return record.result as ApprovalResult<FeedbackValues<F>>;
  }

  const result: ApprovalResult<FeedbackValues<F>> = { type: "TIMED_OUT", id };
  await runtime.binding.run("hitldev:record-timeout", () => runtime.store.resolve(id, result));
  if (record) {
    await runtime.binding.run("hitldev:update-channel", () => updateChannels(runtime, record, result));
  }
  return result;
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
 * against the stored field definitions, resolves the engine wait, and reflects
 * the outcome back into the channel.
 */
export async function resolveApproval(
  runtime: HitlRuntime,
  callback: HitlCallback,
): Promise<ApprovalResult> {
  const record = await runtime.store.get(callback.requestId);
  if (!record) throw new Error(`Unknown approval "${callback.requestId}"`);

  const result = toResult(record.id, record.fields, callback);

  await runtime.store.resolve(record.id, result);
  await runtime.binding.resolve(record.token, result);

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
  const batch = await runtime.store.getBatch(callback.batchId);
  if (!batch) throw new Error(`Unknown batch "${callback.batchId}"`);
  const items = await runtime.store.listByBatch(callback.batchId);

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
    await runtime.store.resolve(item.id, result);
    await runtime.binding.resolve(item.token, result);
  }

  const results = planned.map((p) => p.result);
  await updateBatchChannels(runtime, batch, items, results);
  return results;
}

async function updateBatchChannels(
  runtime: HitlRuntime,
  batch: BatchRecord | null,
  items: ApprovalRecord[],
  results: ApprovalResult[],
): Promise<void> {
  if (batch) {
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

/** Fire-and-forget progress updates and threaded context. */
export async function notifyVia(
  runtime: HitlRuntime,
  notification: Notification,
): Promise<void> {
  const plugin = pickPlugin(runtime.plugins, notification.channel);
  await runtime.binding.run("hitldev:notify", async () => {
    const enriched: Notification = { ...notification };
    if (notification.parent) {
      const parent = await runtime.store.get(notification.parent);
      if (parent?.externalId) enriched.parentExternalId = parent.externalId;
    }
    await plugin.notify(enriched);
  });
}
