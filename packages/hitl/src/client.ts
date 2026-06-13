import type {
  BatchTimeoutResponse,
  CreateBatchResponse,
  CreateRequestResponse,
  RemindBody,
  TimeoutResponse,
} from "./api-types";
import type { WorkflowPrimitives } from "./binding";
import { parseDuration, type Duration } from "./duration";
import type { HumanItem, WaitForHumanOptions } from "./human-options";
import { validateWaitForHumanOptions } from "./human-options";
import type { HumanActionDef } from "./human-actions";
import type { HumanResult } from "./human-result";
import { isEscalate, type ReminderEntry } from "./reminder";
import type { Notification } from "./types";

export const DEFAULT_BASE_PATH = "/.well-known/hitldev/v1";

export interface CreateHitlClientOptions extends WorkflowPrimitives {
  /** Base URL of the app hosting the hitldev server, e.g. `https://my-app.vercel.app`. Lazy so engines can resolve it at run time. */
  url: string | (() => string);
  /** Where the server is mounted. Defaults to `/.well-known/hitldev/v1`. */
  basePath?: string;
  /** Bearer secret of the internal API. Defaults to `process.env.HITL_SECRET`, read lazily. */
  secret?: string | (() => string | undefined);
}

/**
 * The workflow-side API. A thin HTTP client: `suspend()` for the resume token,
 * one durable fetch to the server, then await the suspension. State and
 * adapters live only on the server.
 */
export interface HitlClient {
  waitForHuman<const Actions extends readonly HumanActionDef[]>(
    opts: WaitForHumanOptions<Actions> & { items?: undefined },
  ): Promise<HumanResult<Actions>>;

  waitForHuman<const Actions extends readonly HumanActionDef[]>(
    opts: WaitForHumanOptions<Actions> & { items: ReadonlyArray<HumanItem<Actions>> },
  ): Promise<HumanResult<Actions>[]>;

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
        : (options.secret ?? process.env.HITL_SECRET);

    const headers: Record<string, string> = { "content-type": "application/json" };
    if (secret) headers.authorization = `Bearer ${secret}`;

    const url = `${base.replace(/\/$/, "")}${basePath}${path}`;
    const res = await request({ url, method: "POST", headers, body: JSON.stringify(body) });
    if (!res.ok) {
      throw new Error(`hitldev: POST ${path} failed with ${res.status}: ${res.body}`);
    }
    return JSON.parse(res.body) as T;
  }

  async function waitForHuman<const Actions extends readonly HumanActionDef[]>(
    opts: WaitForHumanOptions<Actions>,
  ): Promise<HumanResult<Actions> | HumanResult<Actions>[]> {
    validateWaitForHumanOptions(opts);

    if (opts.items !== undefined) {
      return waitForHumanBatch(opts as WaitForHumanOptions<Actions> & {
        items: NonNullable<WaitForHumanOptions<Actions>["items"]>;
      });
    }

    const suspension = suspend<HumanResult<Actions>>();
    const { id } = await callApi<CreateRequestResponse>("/requests", {
      token: suspension.token,
      message: opts.message,
      actions: opts.actions,
      context: opts.context,
      channel: opts.channel,
    });

    return waitWithReminders(opts, {
      promise: suspension.promise,
      remind: (entry) => callApi(`/requests/${id}/remind`, toRemindBody(entry)),
      timeout: async () =>
        (await callApi<TimeoutResponse>(`/requests/${id}/timeout`, {}))
          .result as HumanResult<Actions>,
    });
  }

  async function waitForHumanBatch<const Actions extends readonly HumanActionDef[]>(
    opts: WaitForHumanOptions<Actions> & {
      items: NonNullable<WaitForHumanOptions<Actions>["items"]>;
    },
  ): Promise<HumanResult<Actions>[]> {
    // One durable wait per item, created serially: token order must be stable across replays.
    const suspensions = opts.items.map(() => suspend<HumanResult<Actions>>());

    const { batchId } = await callApi<CreateBatchResponse>("/batches", {
      title: opts.title,
      channel: opts.channel,
      actions: opts.actions,
      context: opts.context,
      defaultsActionId: opts.defaultsActionId,
      items: opts.items.map((item, index) => ({
        token: suspensions[index]!.token,
        message: item.message,
        defaults: item.defaults,
      })),
    });

    return waitWithReminders(opts, {
      promise: Promise.all(suspensions.map((s) => s.promise)),
      remind: (entry) => callApi(`/batches/${batchId}/remind`, toRemindBody(entry)),
      timeout: async () =>
        (await callApi<BatchTimeoutResponse>(`/batches/${batchId}/timeout`, {}))
          .results as HumanResult<Actions>[],
    });
  }

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
        reminderIndex++;
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

      while (reminderIndex < schedule.length && schedule[reminderIndex]!.ms <= elapsedMs) {
        await subject.remind(schedule[reminderIndex]!.entry);
        reminderIndex++;
      }
    }
  }

  return {
    waitForHuman: waitForHuman as HitlClient["waitForHuman"],
    notify: (notification) => callApi("/notifications", notification).then(() => undefined),
  };
}

function toRemindBody(entry: ReminderEntry): RemindBody {
  if (isEscalate(entry)) {
    return { kind: "escalate", channel: entry.channel, message: entry.message, mode: entry.mode };
  }
  return { kind: "remind", message: entry.message };
}
