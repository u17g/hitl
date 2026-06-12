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
import type { ApprovalRecord, Store } from "./store";
import type {
  ApprovalResult,
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

  return waitWithReminders<F>(runtime, {
    id,
    plugin,
    fields: (opts.fields ?? {}) as F,
    message: opts.message,
    suspension,
    timeoutMs,
    reminderSchedule,
  });
}

interface WaitContext<F extends Record<string, HitlField>> {
  id: string;
  plugin: HitlPlugin;
  fields: F;
  message: string;
  suspension: EngineSuspension<ApprovalResult<FeedbackValues<F>>>;
  timeoutMs: number | undefined;
  reminderSchedule: ScheduledReminder[];
}

async function waitWithReminders<F extends Record<string, HitlField>>(
  runtime: HitlRuntime,
  ctx: WaitContext<F>,
): Promise<ApprovalResult<FeedbackValues<F>>> {
  let elapsedMs = 0;
  let reminderIndex = 0;

  while (true) {
    while (reminderIndex < ctx.reminderSchedule.length) {
      const next = ctx.reminderSchedule[reminderIndex]!;
      if (next.ms > elapsedMs) break;
      if (ctx.timeoutMs !== undefined && next.ms >= ctx.timeoutMs) {
        reminderIndex++;
        continue;
      }
      await runReminder(runtime, ctx, next.entry, reminderIndex);
      reminderIndex++;
    }

    let nextWakeMs = Infinity;
    let wakeKind: "timeout" | "reminder" | undefined;

    if (ctx.timeoutMs !== undefined && ctx.timeoutMs > elapsedMs) {
      nextWakeMs = ctx.timeoutMs - elapsedMs;
      wakeKind = "timeout";
    }

    if (reminderIndex < ctx.reminderSchedule.length) {
      const nextReminderMs = ctx.reminderSchedule[reminderIndex]!.ms - elapsedMs;
      if (nextReminderMs >= 0 && nextReminderMs < nextWakeMs) {
        nextWakeMs = nextReminderMs;
        wakeKind = "reminder";
      }
    }

    if (wakeKind === undefined) {
      return (await ctx.suspension.promise) as ApprovalResult<FeedbackValues<F>>;
    }

    const winner = await Promise.race([
      ctx.suspension.promise.then((result) => ({ kind: "resolved" as const, result })),
      runtime.binding.sleep(nextWakeMs).then(() => ({ kind: wakeKind! })),
    ]);

    if (winner.kind === "resolved") {
      return winner.result as ApprovalResult<FeedbackValues<F>>;
    }

    elapsedMs += nextWakeMs;

    if (winner.kind === "timeout") {
      return finalizeTimeout(runtime, ctx.id, ctx.plugin);
    }

    const entry = ctx.reminderSchedule[reminderIndex]!.entry;
    await runReminder(runtime, ctx, entry, reminderIndex);
    reminderIndex++;
  }
}

async function runReminder<F extends Record<string, HitlField>>(
  runtime: HitlRuntime,
  ctx: WaitContext<F>,
  entry: ReminderEntry,
  index: number,
): Promise<void> {
  const record = await runtime.binding.run(`hitldev:reminder-check:${index}`, () =>
    runtime.store.get(ctx.id),
  );
  if (!record || record.status !== "pending") return;

  if (isEscalate(entry)) {
    await runEscalate(runtime, ctx, entry, index);
  } else {
    await runRemind(runtime, ctx, entry, index);
  }
}

async function runRemind<F extends Record<string, HitlField>>(
  runtime: HitlRuntime,
  ctx: WaitContext<F>,
  entry: RemindEntry,
  index: number,
): Promise<void> {
  await runtime.binding.run(`hitldev:remind:${index}`, async () => {
    const parent = await runtime.store.get(ctx.id);
    const notification: Notification = {
      parent: ctx.id,
      message: remindMessage(entry),
      channel: ctx.plugin.id,
    };
    if (parent?.externalId) notification.parentExternalId = parent.externalId;
    await ctx.plugin.notify(notification);
  });
}

async function runEscalate<F extends Record<string, HitlField>>(
  runtime: HitlRuntime,
  ctx: WaitContext<F>,
  entry: EscalateEntry,
  index: number,
): Promise<void> {
  const mode = entry.mode ?? "notify";
  const escalatePlugin = pickPlugin(runtime.plugins, entry.channel);

  if (mode === "redeliver") {
    const { externalId } = await runtime.binding.run(`hitldev:escalate-redeliver:${index}`, () =>
      escalatePlugin.send({
        id: ctx.id,
        channel: entry.channel,
        message: ctx.message,
        fields: ctx.fields,
      }),
    );
    await runtime.binding.run(`hitldev:escalate-store-external-id:${index}`, () =>
      runtime.store.setExternalId(ctx.id, externalId, entry.channel),
    );
    return;
  }

  await runtime.binding.run(`hitldev:escalate-notify:${index}`, async () => {
    const escalatePlugin = pickPlugin(runtime.plugins, entry.channel);
    const parent = await runtime.store.get(ctx.id);
    const notification: Notification = {
      message: escalateMessage(entry),
      channel: entry.channel,
      parent: ctx.id,
    };
    if (parent?.externalId) notification.parentExternalId = parent.externalId;
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
