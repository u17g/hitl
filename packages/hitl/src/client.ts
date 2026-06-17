import type {
  BatchTimeoutResponse,
  CreateBatchResponse,
  CreateRequestResponse,
  NotifyResponse,
  RemindBody,
  TimeoutResponse,
} from "./api-types";
import type { WorkflowPrimitives } from "./binding";
import { parseDuration, type Duration } from "./duration";
import type {
  HumanItem,
  HumanWaitOptions,
  RequestHumanOptions,
  WaitForHumanOptions,
} from "./human-options";
import { validateWaitForHumanOptions } from "./human-options";
import type { HumanActionDef } from "./human-actions";
import type { HumanResult } from "./human-result";
import { isEscalate, type ReminderEntry } from "./reminder";
import { expandReminderSchedule } from "./schedule";
import type { Notification, TimelineAnchor } from "./types";

export const DEFAULT_BASE_PATH = "/.well-known/hitl/v1";
export const CHANNELS_BASE_PATH = `${DEFAULT_BASE_PATH}/channels`;

const HumanPendingBrand = Symbol.for("hitl.HumanPending");

interface HumanPendingHandle {
  batch: boolean;
  wait(opts?: HumanWaitOptions): Promise<HumanResult<HumanActionDef[]> | HumanResult<HumanActionDef[]>[]>;
}

/** Pending human request. Pass as `TimelineAnchor` to `notify` or chained `waitForHuman`. */
export interface HumanPending<Actions extends readonly HumanActionDef[]> extends TimelineAnchor {
  readonly [HumanPendingBrand]: HumanPendingHandle;
}

/** Pending batch request. Anchor id is the batch id. */
export interface HumanBatchPending<Actions extends readonly HumanActionDef[]> extends TimelineAnchor {
  readonly [HumanPendingBrand]: HumanPendingHandle;
  readonly batch: true;
}

type NotifyBase = {
  message: string;
  channel?: string;
  detail?: Record<string, unknown>;
};

/** Workflow-side notify options. Prefer `after` once a human step has resolved. */
export type NotifyOptions =
  | (NotifyBase & { after: HumanResult | TimelineAnchor | HumanPending<readonly HumanActionDef[]> })
  | (NotifyBase & { on: string })
  | NotifyBase;

export interface CreateHitlClientOptions extends WorkflowPrimitives {
  /** Base URL of the app hosting the hitl server, e.g. `https://my-app.vercel.app`. Lazy so engines can resolve it at run time. */
  url: string | (() => string);
  /** Where the server is mounted. Defaults to `/.well-known/hitl/v1`. */
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
  requestHuman<const Actions extends readonly HumanActionDef[]>(
    opts: RequestHumanOptions<Actions> & { items?: undefined },
  ): Promise<HumanPending<Actions>>;

  requestHuman<const Actions extends readonly HumanActionDef[]>(
    opts: RequestHumanOptions<Actions> & { items: ReadonlyArray<HumanItem<Actions>> },
  ): Promise<HumanBatchPending<Actions>>;

  waitForHuman<const Actions extends readonly HumanActionDef[]>(
    opts: WaitForHumanOptions<Actions> & { items?: undefined },
  ): Promise<HumanResult<Actions>>;

  waitForHuman<const Actions extends readonly HumanActionDef[]>(
    opts: WaitForHumanOptions<Actions> & { items: ReadonlyArray<HumanItem<Actions>> },
  ): Promise<HumanResult<Actions>[]>;

  waitForHuman<const Actions extends readonly HumanActionDef[]>(
    pending: HumanPending<Actions>,
    opts?: HumanWaitOptions,
  ): Promise<HumanResult<Actions>>;

  waitForHuman<const Actions extends readonly HumanActionDef[]>(
    pending: HumanBatchPending<Actions>,
    opts?: HumanWaitOptions,
  ): Promise<HumanResult<Actions>[]>;

  notify(notification: NotifyOptions): Promise<TimelineAnchor>;
}

function isHumanPending(
  value: unknown,
): value is HumanPending<readonly HumanActionDef[]> | HumanBatchPending<readonly HumanActionDef[]> {
  return typeof value === "object" && value !== null && HumanPendingBrand in value;
}

function createPending<Actions extends readonly HumanActionDef[]>(
  id: string,
  externalRef: string,
  handle: HumanPendingHandle,
): HumanPending<Actions> {
  return { id, externalRef, [HumanPendingBrand]: handle };
}

function createBatchPending<Actions extends readonly HumanActionDef[]>(
  id: string,
  externalRef: string,
  handle: HumanPendingHandle,
): HumanBatchPending<Actions> {
  return { id, externalRef, batch: true, [HumanPendingBrand]: handle };
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
      throw new Error(`hitl: POST ${path} failed with ${res.status}: ${res.body}`);
    }
    return JSON.parse(res.body) as T;
  }

  async function requestHuman<const Actions extends readonly HumanActionDef[]>(
    opts: RequestHumanOptions<Actions>,
  ): Promise<HumanPending<Actions>> {
    validateWaitForHumanOptions(opts);

    if (opts.items !== undefined) {
      return requestHumanBatch(opts as RequestHumanOptions<Actions> & {
        items: NonNullable<RequestHumanOptions<Actions>["items"]>;
      });
    }

    return requestHumanSingle(
      opts as RequestHumanOptions<Actions> & { items?: undefined },
    );
  }

  async function requestHumanSingle<const Actions extends readonly HumanActionDef[]>(
    opts: RequestHumanOptions<Actions> & { items?: undefined },
  ): Promise<HumanPending<Actions>> {
    const suspension = suspend<HumanResult<Actions>>();
    const { id, externalRef } = await callApi<CreateRequestResponse>("/requests", {
      token: suspension.token,
      message: opts.message,
      actions: opts.actions,
      context: opts.context,
      channel: opts.channel,
      namespace: opts.namespace,
      after: opts.after ? { id: opts.after.id } : undefined,
    });

    return createPending(id, externalRef, {
      batch: false,
      wait: (waitOpts) =>
        waitWithReminders(waitOpts ?? {}, {
          promise: suspension.promise,
          remind: (entry) => callApi(`/requests/${id}/remind`, toRemindBody(entry)),
          timeout: async () =>
            (await callApi<TimeoutResponse>(`/requests/${id}/timeout`, {}))
              .result as HumanResult<Actions>,
        }),
    });
  }

  async function requestHumanBatch<const Actions extends readonly HumanActionDef[]>(
    opts: RequestHumanOptions<Actions> & {
      items: NonNullable<RequestHumanOptions<Actions>["items"]>;
    },
  ): Promise<HumanBatchPending<Actions>> {
    const suspensions = opts.items.map(() => suspend<HumanResult<Actions>>());

    const { batchId, externalRef } = await callApi<CreateBatchResponse>("/batches", {
      message: opts.message,
      channel: opts.channel,
      actions: opts.actions,
      context: opts.context,
      namespace: opts.namespace,
      defaultsActionId: opts.defaultsActionId,
      after: opts.after ? { id: opts.after.id } : undefined,
      items: opts.items.map((item, index) => ({
        token: suspensions[index]!.token,
        message: item.message,
        defaults: item.defaults,
      })),
    });

    return createBatchPending(batchId, externalRef, {
      batch: true,
      wait: (waitOpts) =>
        waitWithReminders(waitOpts ?? {}, {
          promise: Promise.all(suspensions.map((s) => s.promise)),
          remind: (entry) => callApi(`/batches/${batchId}/remind`, toRemindBody(entry)),
          timeout: async () =>
            (await callApi<BatchTimeoutResponse>(`/batches/${batchId}/timeout`, {}))
              .results as HumanResult<Actions>[],
        }),
    });
  }

  async function waitForHuman<const Actions extends readonly HumanActionDef[]>(
    optsOrPending:
      | WaitForHumanOptions<Actions>
      | HumanPending<Actions>
      | HumanBatchPending<Actions>,
    waitOpts?: HumanWaitOptions,
  ): Promise<HumanResult<Actions> | HumanResult<Actions>[]> {
    if (isHumanPending(optsOrPending)) {
      return optsOrPending[HumanPendingBrand].wait(waitOpts) as Promise<
        HumanResult<Actions> | HumanResult<Actions>[]
      >;
    }

    const opts = optsOrPending;
    validateWaitForHumanOptions(opts);
    const pending = await requestHuman(opts);
    return pending[HumanPendingBrand].wait({
      timeout: opts.timeout,
      reminders: opts.reminders,
    }) as Promise<HumanResult<Actions> | HumanResult<Actions>[]>;
  }

  async function waitWithReminders<T>(
    opts: HumanWaitOptions,
    subject: {
      promise: Promise<T>;
      remind(entry: ReminderEntry): Promise<unknown>;
      timeout(): Promise<T>;
    },
  ): Promise<T> {
    const timeoutMs = opts.timeout === undefined ? undefined : parseDuration(opts.timeout);
    const anchor = new Date();
    const schedule = expandReminderSchedule(opts.reminders ?? [], anchor, timeoutMs);

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

      if (reminderIndex < schedule.length) {
        const nextReminderMs = schedule[reminderIndex]!.atMs - elapsedMs;
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

      while (reminderIndex < schedule.length && schedule[reminderIndex]!.atMs <= elapsedMs) {
        await subject.remind(schedule[reminderIndex]!.entry);
        reminderIndex++;
      }
    }
  }

  return {
    requestHuman: requestHuman as HitlClient["requestHuman"],
    waitForHuman: waitForHuman as HitlClient["waitForHuman"],
    notify: (notification) =>
      callApi<NotifyResponse>("/notifications", toNotifyBody(notification)).then((res) => ({
        id: res.id,
        externalRef: res.externalRef,
      })),
  };
}

function toNotifyBody(notification: NotifyOptions): Notification {
  if ("after" in notification && notification.after) {
    const { after, ...rest } = notification;
    return { ...rest, after: { id: after.id } };
  }
  return notification;
}

function toRemindBody(entry: ReminderEntry): RemindBody {
  if (isEscalate(entry)) {
    return { kind: "escalate", channel: entry.channel, message: entry.message, mode: entry.mode };
  }
  return { kind: "remind", message: entry.message };
}
