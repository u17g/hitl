import type { EngineBinding } from "./binding";
import { parseDuration, type Duration } from "./duration";
import type { FeedbackValues, HitlField } from "./fields";
import type { ApprovalStore } from "./store";
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
  store: ApprovalStore;
  plugins: HitlPlugin[];
}

export interface ApprovalOptions<F extends Record<string, HitlField>> {
  message: string;
  feedbacks?: F;
  /** Plugin id; defaults to the first configured plugin. */
  channel?: string;
  /** e.g. "72h"; resolves as { type: "TIMED_OUT" }. */
  timeout?: Duration;
}

function pickPlugin(plugins: HitlPlugin[], channel?: string): HitlPlugin {
  if (plugins.length === 0) {
    throw new Error("No openhitl plugins configured. Pass at least one to createHitl().");
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
 * Workflow side: record the request, deliver it via the plugin, and suspend
 * until a callback (or the timeout) resolves it.
 */
export async function requestApproval<F extends Record<string, HitlField>>(
  runtime: HitlRuntime,
  opts: ApprovalOptions<F>,
): Promise<ApprovalResult<FeedbackValues<F>>> {
  const plugin = pickPlugin(runtime.plugins, opts.channel);
  const id = crypto.randomUUID();
  const fields = opts.feedbacks ?? {};

  const suspension = runtime.binding.suspend<ApprovalResult<FeedbackValues<F>>>();
  await runtime.store.create({
    id,
    token: suspension.token,
    channel: plugin.id,
    message: opts.message,
    fields,
  });

  const { externalId } = await plugin.send({ id, channel: plugin.id, message: opts.message, fields });
  await runtime.store.setExternalId(id, externalId);

  if (opts.timeout === undefined) return suspension.promise;

  const timeoutMs = parseDuration(opts.timeout);
  const TIMED_OUT = Symbol("timed-out");
  const winner = await Promise.race([
    suspension.promise,
    runtime.binding.sleep(timeoutMs).then(() => TIMED_OUT),
  ]);
  if (winner !== TIMED_OUT) return winner as ApprovalResult<FeedbackValues<F>>;

  // The callback may have won a near-simultaneous race; prefer its result.
  const record = await runtime.store.get(id);
  if (record?.status === "resolved" && record.result) {
    return record.result as ApprovalResult<FeedbackValues<F>>;
  }

  const result: ApprovalResult<FeedbackValues<F>> = { type: "TIMED_OUT", id };
  await runtime.store.resolve(id, result);
  if (record?.externalId) await plugin.update?.(record.externalId, result);
  return result;
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

  const plugin = runtime.plugins.find((p) => p.id === record.channel);
  if (plugin?.update && record.externalId) {
    await plugin.update(record.externalId, result);
  }
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
  const enriched: Notification = { ...notification };
  if (notification.parent) {
    const parent = await runtime.store.get(notification.parent);
    if (parent?.externalId) enriched.parentExternalId = parent.externalId;
  }
  await plugin.notify(enriched);
}
