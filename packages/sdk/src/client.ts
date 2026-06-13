import type {
  BatchTimeoutResponse,
  CreateBatchResponse,
  CreateRequestResponse,
  RemindBody,
  TimeoutResponse,
} from "./api-types";
import type { WorkflowPrimitives } from "./binding";
import { parseDuration, type Duration } from "./duration";
import type { FeedbackValues, HitlField } from "./fields";
import { isEscalate, type ReminderEntry } from "./reminder";
import type { ApprovalResult, Notification } from "./types";

export const DEFAULT_BASE_PATH = "/.well-known/hitldev/v1";

export interface ApprovalOptions<F extends Record<string, HitlField>> {
  message: string;
  fields?: F;
  /** Plugin id; defaults to the first plugin configured on the server. */
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
  /** Plugin id; defaults to the first plugin configured on the server. */
  channel?: string;
  /** One timeout for the whole batch; pending items resolve as TIMED_OUT. */
  timeout?: Duration;
  /** Remind or escalate while any item is pending. */
  reminder?: ReminderEntry[];
}

export interface CreateHitlClientOptions extends WorkflowPrimitives {
  /** Base URL of the app hosting the hitldev server, e.g. `https://my-app.vercel.app`. Lazy so engines can resolve it at run time. */
  url: string | (() => string);
  /** Where the server is mounted. Defaults to `/.well-known/hitldev/v1`. */
  basePath?: string;
  /** Bearer secret of the internal API. Defaults to `process.env.HITLDEV_SECRET`, read lazily. */
  secret?: string | (() => string | undefined);
}

/**
 * The workflow-side API. A thin HTTP client: `suspend()` for the resume token,
 * one durable fetch to the server, then await the suspension. Store and
 * plugins live only on the server.
 */
export interface HitlClient {
  waitForApproval<F extends Record<string, HitlField>>(
    opts: ApprovalOptions<F>,
  ): Promise<ApprovalResult<FeedbackValues<F>>>;
  waitForBatchApprovals<F extends Record<string, HitlField>>(
    opts: BatchApprovalOptions<F>,
  ): Promise<ApprovalResult<FeedbackValues<F>>[]>;
  notify(notification: Notification): Promise<void>;
}

export function createHitlClient(options: CreateHitlClientOptions): HitlClient {
  const { suspend, sleep, request } = options;
  const basePath = options.basePath ?? DEFAULT_BASE_PATH;

  async function callApi<T>(path: string, body: unknown): Promise<T> {
    const base = typeof options.url === "function" ? options.url() : options.url;
    const secret =
      typeof options.secret === "function"
        ? options.secret()
        : (options.secret ?? process.env.HITLDEV_SECRET);

    const headers: Record<string, string> = { "content-type": "application/json" };
    if (secret) headers.authorization = `Bearer ${secret}`;

    const url = `${base.replace(/\/$/, "")}${basePath}${path}`;
    const res = await request({ url, method: "POST", headers, body: JSON.stringify(body) });
    if (!res.ok) {
      throw new Error(`hitldev: POST ${path} failed with ${res.status}: ${res.body}`);
    }
    return JSON.parse(res.body) as T;
  }

  async function waitForApproval<F extends Record<string, HitlField>>(
    opts: ApprovalOptions<F>,
  ): Promise<ApprovalResult<FeedbackValues<F>>> {
    const suspension = suspend<ApprovalResult<FeedbackValues<F>>>();
    const { id } = await callApi<CreateRequestResponse>("/requests", {
      token: suspension.token,
      message: opts.message,
      fields: opts.fields ?? {},
      channel: opts.channel,
    });

    return waitWithReminders(opts, {
      promise: suspension.promise,
      remind: (entry) => callApi(`/requests/${id}/remind`, toRemindBody(entry)),
      timeout: async () =>
        (await callApi<TimeoutResponse>(`/requests/${id}/timeout`, {})).result as ApprovalResult<
          FeedbackValues<F>
        >,
    });
  }

  async function waitForBatchApprovals<F extends Record<string, HitlField>>(
    opts: BatchApprovalOptions<F>,
  ): Promise<ApprovalResult<FeedbackValues<F>>[]> {
    if (opts.items.length === 0) {
      throw new Error("waitForBatchApprovals needs at least one item.");
    }
    const fields = opts.fields ?? {};

    // One durable wait per item, created serially: token order must be stable across replays.
    const suspensions = opts.items.map(() => suspend<ApprovalResult<FeedbackValues<F>>>());

    const { batchId } = await callApi<CreateBatchResponse>("/batches", {
      title: opts.title,
      channel: opts.channel,
      fields,
      items: opts.items.map((item, index) => ({
        token: suspensions[index]!.token,
        message: item.message,
        fields: mergeItemFields(fields, item.defaults),
      })),
    });

    return waitWithReminders(opts, {
      promise: Promise.all(suspensions.map((s) => s.promise)),
      remind: (entry) => callApi(`/batches/${batchId}/remind`, toRemindBody(entry)),
      timeout: async () =>
        (await callApi<BatchTimeoutResponse>(`/batches/${batchId}/timeout`, {}))
          .results as ApprovalResult<FeedbackValues<F>>[],
    });
  }

  /**
   * The reminder/timeout loop. The schedule and the durable timers live here in
   * the workflow; whether the subject is still pending is the server's call.
   */
  async function waitWithReminders<T>(
    opts: { timeout?: Duration; reminder?: ReminderEntry[] },
    subject: {
      promise: Promise<T>;
      remind(entry: ReminderEntry): Promise<unknown>;
      timeout(): Promise<T>;
    },
  ): Promise<T> {
    const timeoutMs = opts.timeout === undefined ? undefined : parseDuration(opts.timeout);
    const schedule = (opts.reminder ?? [])
      .map((entry) => ({ entry, ms: parseDuration(entry.after) }))
      .sort((a, b) => a.ms - b.ms || 0);

    if (timeoutMs === undefined && schedule.length === 0) {
      return subject.promise;
    }

    let elapsedMs = 0;
    let reminderIndex = 0;

    while (true) {
      let nextWakeMs = Infinity;
      let wakeKind: "timeout" | "reminder" | undefined;

      if (timeoutMs !== undefined && timeoutMs > elapsedMs) {
        nextWakeMs = timeoutMs - elapsedMs;
        wakeKind = "timeout";
      }

      while (
        reminderIndex < schedule.length &&
        timeoutMs !== undefined &&
        schedule[reminderIndex]!.ms >= timeoutMs
      ) {
        reminderIndex++; // a reminder at or past the timeout would never be seen
      }
      if (reminderIndex < schedule.length) {
        const nextReminderMs = schedule[reminderIndex]!.ms - elapsedMs;
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
        sleep(nextWakeMs).then(() => ({ kind: wakeKind! })),
      ]);

      if (winner.kind === "resolved") {
        return winner.result;
      }

      elapsedMs += nextWakeMs;

      if (winner.kind === "timeout") {
        return subject.timeout();
      }

      // Fire every reminder scheduled at this instant, in array order.
      while (reminderIndex < schedule.length && schedule[reminderIndex]!.ms <= elapsedMs) {
        await subject.remind(schedule[reminderIndex]!.entry);
        reminderIndex++;
      }
    }
  }

  return {
    waitForApproval,
    waitForBatchApprovals,
    notify: (notification) => callApi("/notifications", notification).then(() => undefined),
  };
}

function toRemindBody(entry: ReminderEntry): RemindBody {
  if (isEscalate(entry)) {
    return { kind: "escalate", channel: entry.channel, message: entry.message, mode: entry.mode };
  }
  return { kind: "remind", message: entry.message };
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
