"use client";

import {
  effectiveActionLabel,
  effectiveCloseLabel,
  effectiveSubmitLabel,
} from "@hitl-sdk/hitl/adapter";
import { normalizeActions } from "@hitl-sdk/hitl/state";
import type { HitlField } from "@hitl-sdk/hitl";
import type { HumanRequestRecord, TimelineEntry } from "@hitl-sdk/hitl/state";
import { useCallback, useEffect, useState, type CSSProperties, type FormEvent } from "react";

interface RunResponse {
  runId: string;
  name: string;
}

type LogEntry = { time: string; text: string; tone?: "ok" | "err" };

async function readJson<T>(res: Response): Promise<T> {
  const body = (await res.json()) as T & { error?: string };
  if (!res.ok) throw new Error(body.error ?? res.statusText);
  return body;
}

function fieldDefault(field: HitlField): unknown {
  if (field.default !== undefined) return field.default;
  if (field.kind === "confirm") return false;
  return "";
}

function FieldInput({
  name,
  field,
  value,
  onChange,
  disabled,
}: {
  name: string;
  field: HitlField;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled?: boolean;
}) {
  const id = `field-${name}`;
  if (field.kind === "textarea") {
    return (
      <label style={styles.fieldLabel} htmlFor={id}>
        {field.label}
        <textarea
          id={id}
          style={styles.textarea}
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
        />
      </label>
    );
  }
  if (field.kind === "select") {
    return (
      <label style={styles.fieldLabel} htmlFor={id}>
        {field.label}
        <select
          id={id}
          style={styles.input}
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
        >
          {(field.options ?? []).map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </label>
    );
  }
  if (field.kind === "confirm") {
    return (
      <label style={styles.checkboxLabel}>
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
          disabled={disabled}
        />
        {field.label}
      </label>
    );
  }
  return (
    <label style={styles.fieldLabel} htmlFor={id}>
      {field.label}
      <input
        id={id}
        style={styles.input}
        value={String(value ?? "")}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      />
    </label>
  );
}

function FeedbackForm({
  title,
  fields,
  submitLabel,
  closeLabel,
  onSubmit,
  onCancel,
  busy,
}: {
  title: string;
  fields: Record<string, HitlField>;
  submitLabel: string;
  closeLabel: string;
  onSubmit: (feedbacks: Record<string, unknown>) => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const [values, setValues] = useState<Record<string, unknown>>(() => {
    const initial: Record<string, unknown> = {};
    for (const [key, field] of Object.entries(fields)) {
      initial[key] = fieldDefault(field);
    }
    return initial;
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    onSubmit(values);
  }

  return (
    <form style={styles.form} onSubmit={handleSubmit}>
      <p style={styles.formTitle}>{title}</p>
      {Object.entries(fields).map(([key, field]) => (
        <FieldInput
          key={key}
          name={key}
          field={field}
          value={values[key]}
          onChange={(value) => setValues((prev) => ({ ...prev, [key]: value }))}
          disabled={busy}
        />
      ))}
      <div style={styles.actions}>
        <button type="submit" style={styles.primaryBtn} disabled={busy}>
          {submitLabel}
        </button>
        <button type="button" style={styles.ghostBtn} onClick={onCancel} disabled={busy}>
          {closeLabel}
        </button>
      </div>
    </form>
  );
}

function actionButtonStyle(id: string): CSSProperties {
  if (id === "approve") return approveBtnStyle;
  if (id === "deny") return denyBtnStyle;
  return ghostBtnStyle;
}

const approveBtnStyle: CSSProperties = {
  padding: "0.45rem 0.85rem",
  background: "#15803d",
  color: "#fff",
  border: "none",
  borderRadius: "8px",
  fontWeight: 600,
  cursor: "pointer",
};

const denyBtnStyle: CSSProperties = {
  padding: "0.45rem 0.85rem",
  background: "#fff",
  color: "#b91c1c",
  border: "1px solid #fecaca",
  borderRadius: "8px",
  fontWeight: 600,
  cursor: "pointer",
};

const ghostBtnStyle: CSSProperties = {
  padding: "0.35rem 0.65rem",
  background: "transparent",
  border: "1px solid #d1d5db",
  borderRadius: "6px",
  fontSize: "0.8125rem",
  cursor: "pointer",
};

export function DemoPanel() {
  const [name, setName] = useState("world");
  const [pending, setPending] = useState<HumanRequestRecord[]>([]);
  const [resolved, setResolved] = useState<HumanRequestRecord[]>([]);
  const [lastRun, setLastRun] = useState<RunResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [activeForm, setActiveForm] = useState<{
    id: string;
    actionId: string;
    fields: Record<string, HitlField>;
    title: string;
    submitLabel: string;
    closeLabel: string;
  } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<TimelineEntry[] | null>(null);
  const [timelineLoading, setTimelineLoading] = useState(false);

  const pushLog = useCallback((text: string, tone?: LogEntry["tone"]) => {
    setLogs((prev) => [
      { time: new Date().toLocaleTimeString(), text, tone },
      ...prev.slice(0, 19),
    ]);
  }, []);

  const fetchTimeline = useCallback(
    async (id: string) => {
      setTimelineLoading(true);
      try {
        const res = await fetch(`/api/inbox/${encodeURIComponent(id)}/timeline`);
        const body = await readJson<{ timeline: TimelineEntry[] }>(res);
        setTimeline(body.timeline);
      } catch (err) {
        setTimeline([]);
        pushLog(err instanceof Error ? err.message : "Failed to load timeline", "err");
      } finally {
        setTimelineLoading(false);
      }
    },
    [pushLog],
  );

  const refresh = useCallback(async () => {
    const [pendingRes, resolvedRes] = await Promise.all([
      fetch("/api/inbox?status=pending"),
      fetch("/api/inbox?status=resolved"),
    ]);
    const pendingBody = await readJson<{ requests: HumanRequestRecord[] }>(pendingRes);
    const resolvedBody = await readJson<{ requests: HumanRequestRecord[] }>(resolvedRes);
    setPending(
      pendingBody.requests.map((item) => ({
        ...item,
        actions: normalizeActions(item.actions),
      })),
    );
    setResolved(
      resolvedBody.requests.slice(0, 8).map((item) => ({
        ...item,
        actions: normalizeActions(item.actions),
      })),
    );
    if (selectedId) {
      await fetchTimeline(selectedId);
    }
  }, [selectedId, fetchTimeline]);

  useEffect(() => {
    void refresh().catch((err: unknown) => {
      pushLog(err instanceof Error ? err.message : "Failed to load requests", "err");
    });
    const timer = setInterval(() => void refresh().catch(() => {}), 2000);
    return () => clearInterval(timer);
  }, [refresh, pushLog]);

  async function startWorkflow() {
    setBusy(true);
    try {
      const res = await fetch("/api/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim() || "world" }),
      });
      const run = await readJson<RunResponse>(res);
      setLastRun(run);
      pushLog(`Workflow started (runId: ${run.runId}, name: ${run.name})`);
      await refresh();
    } catch (err) {
      pushLog(err instanceof Error ? err.message : "Failed to start workflow", "err");
    } finally {
      setBusy(false);
    }
  }

  async function resolve(
    id: string,
    actionId: string,
    feedbacks?: Record<string, unknown>,
  ) {
    setBusy(true);
    try {
      const res = await fetch("/api/inbox", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, actionId, feedbacks, by: { name: "demo-ui" } }),
      });
      await readJson<{ result: { type: string } }>(res);
      pushLog(`Resolved ${id} (${actionId})`, actionId === "approve" ? "ok" : undefined);
      setActiveForm(null);
      await refresh();
    } catch (err) {
      pushLog(err instanceof Error ? err.message : "Failed to submit decision", "err");
    } finally {
      setBusy(false);
    }
  }

  function beginAction(item: HumanRequestRecord, actionId: string) {
    const def = item.actions.find((a) => a.id === actionId);
    const fields = def?.fields ?? {};
    if (Object.keys(fields).length === 0) {
      void resolve(item.id, actionId);
      return;
    }
    setActiveForm({
      id: item.id,
      actionId,
      fields,
      title: effectiveActionLabel(def ?? { id: actionId }),
      submitLabel: effectiveSubmitLabel(def ?? { id: actionId }),
      closeLabel: effectiveCloseLabel(def ?? { id: actionId }),
    });
  }

  async function openDetails(id: string) {
    setSelectedId(id);
    setTimeline(null);
    await fetchTimeline(id);
  }

  const selected = selectedId
    ? ([...pending, ...resolved].find((item) => item.id === selectedId) ?? null)
    : null;

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <h1 style={styles.title}>hitl hello-world</h1>
        <p style={styles.lead}>
          Start the workflow, then submit or deny the pending request. Deny opens a reason field;
          timeline entries appear when notify is used.
        </p>
      </header>

      <section style={styles.card}>
        <h2 style={styles.cardTitle}>1. Start workflow</h2>
        <div style={styles.row}>
          <label style={styles.label}>
            Name
            <input
              style={styles.input}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="world"
              disabled={busy}
            />
          </label>
          <button style={styles.primaryBtn} onClick={() => void startWorkflow()} disabled={busy}>
            Run helloWorkflow
          </button>
        </div>
        {lastRun && (
          <p style={styles.meta}>
            Last run: <code style={styles.code}>{lastRun.runId}</code> → greet{" "}
            <strong>{lastRun.name}</strong>
          </p>
        )}
      </section>

      <section style={styles.card}>
        <div style={styles.cardHead}>
          <h2 style={styles.cardTitle}>2. Pending requests</h2>
          <button style={ghostBtnStyle} onClick={() => void refresh()} disabled={busy}>
            Refresh
          </button>
        </div>
        {pending.length === 0 ? (
          <p style={styles.empty}>No pending requests. Start a workflow above.</p>
        ) : (
          <ul style={styles.list}>
            {pending.map((item) => (
              <li key={item.id} style={styles.request}>
                <div>
                  <p style={styles.message}>{item.message}</p>
                  <p style={styles.meta}>
                    <code style={styles.code}>{item.id}</code> · {new Date(item.createdAt).toLocaleString()}
                  </p>
                </div>
                <div style={styles.actions}>
                  {item.actions.map((def) => (
                    <button
                      key={def.id}
                      style={actionButtonStyle(def.id)}
                      disabled={busy}
                      onClick={() => beginAction(item, def.id)}
                    >
                      {effectiveActionLabel(def)}
                    </button>
                  ))}
                  <button
                    style={ghostBtnStyle}
                    disabled={busy}
                    onClick={() => void openDetails(item.id)}
                  >
                    Details
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {activeForm && (
        <section style={styles.card}>
          <FeedbackForm
            title={activeForm.title}
            fields={activeForm.fields}
            submitLabel={activeForm.submitLabel}
            closeLabel={activeForm.closeLabel}
            busy={busy}
            onCancel={() => setActiveForm(null)}
            onSubmit={(feedbacks) => void resolve(activeForm.id, activeForm.actionId, feedbacks)}
          />
        </section>
      )}

      {selected && (
        <section style={styles.card}>
          <h2 style={styles.cardTitle}>Timeline & detail</h2>
          <p style={styles.meta}>
            Selected: <code style={styles.code}>{selected.id}</code>
          </p>
          {selected.context && Object.keys(selected.context).length > 0 && (
            <pre style={styles.pre}>{JSON.stringify(selected.context, null, 2)}</pre>
          )}
          {timelineLoading ? (
            <p style={styles.empty}>Loading timeline…</p>
          ) : (timeline ?? []).length === 0 ? (
            <p style={styles.empty}>No timeline entries yet.</p>
          ) : (
            <ul style={styles.list}>
              {(timeline ?? []).map((entry) => (
                <li key={entry.id} style={styles.resolved}>
                  <span style={styles.badge}>FYI</span>
                  <div>
                    <div>{entry.message}</div>
                    {entry.detail && (
                      <pre style={styles.preSmall}>{JSON.stringify(entry.detail, null, 2)}</pre>
                    )}
                    <p style={styles.meta}>{new Date(entry.createdAt).toLocaleString()}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {resolved.length > 0 && (
        <section style={styles.card}>
          <h2 style={styles.cardTitle}>Recently resolved</h2>
          <ul style={styles.list}>
            {resolved.map((item) => (
              <li key={item.id} style={styles.resolved}>
                <span style={styles.badge}>
                  {item.result?.type === "RESOLVED"
                    ? item.result.actionId
                    : (item.result?.type ?? "—")}
                </span>
                <span>{item.message}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {logs.length > 0 && (
        <section style={styles.card}>
          <h2 style={styles.cardTitle}>Activity</h2>
          <ul style={styles.logList}>
            {logs.map((entry, i) => (
              <li
                key={`${entry.time}-${i}`}
                style={{
                  ...styles.logItem,
                  color: entry.tone === "err" ? "#b91c1c" : entry.tone === "ok" ? "#15803d" : "#374151",
                }}
              >
                <span style={styles.logTime}>{entry.time}</span> {entry.text}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: {
    fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
    padding: "2rem",
    maxWidth: "42rem",
    margin: "0 auto",
    color: "#111827",
    lineHeight: 1.5,
  },
  header: { marginBottom: "1.5rem" },
  title: { fontSize: "1.75rem", fontWeight: 700, margin: "0 0 0.5rem" },
  lead: { margin: 0, color: "#4b5563" },
  code: {
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    fontSize: "0.875em",
    background: "#f3f4f6",
    padding: "0.1em 0.35em",
    borderRadius: "4px",
  },
  card: {
    background: "#fff",
    border: "1px solid #e5e7eb",
    borderRadius: "12px",
    padding: "1.25rem",
    marginBottom: "1rem",
    boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
  },
  cardHead: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "1rem",
    marginBottom: "0.75rem",
  },
  cardTitle: { fontSize: "1rem", fontWeight: 600, margin: "0 0 0.75rem" },
  row: { display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "flex-end" },
  label: { display: "flex", flexDirection: "column", gap: "0.35rem", fontSize: "0.875rem", flex: 1, minWidth: "12rem" },
  fieldLabel: { display: "flex", flexDirection: "column", gap: "0.35rem", fontSize: "0.875rem" },
  checkboxLabel: { display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.875rem" },
  input: {
    padding: "0.55rem 0.75rem",
    border: "1px solid #d1d5db",
    borderRadius: "8px",
    fontSize: "1rem",
  },
  textarea: {
    padding: "0.55rem 0.75rem",
    border: "1px solid #d1d5db",
    borderRadius: "8px",
    fontSize: "1rem",
    minHeight: "4.5rem",
    resize: "vertical",
  },
  primaryBtn: {
    padding: "0.6rem 1rem",
    background: "#111827",
    color: "#fff",
    border: "none",
    borderRadius: "8px",
    fontWeight: 600,
    cursor: "pointer",
  },
  ghostBtn: {
    padding: "0.35rem 0.65rem",
    background: "transparent",
    border: "1px solid #d1d5db",
    borderRadius: "6px",
    fontSize: "0.8125rem",
    cursor: "pointer",
  },
  approveBtn: {
    padding: "0.45rem 0.85rem",
    background: "#15803d",
    color: "#fff",
    border: "none",
    borderRadius: "8px",
    fontWeight: 600,
    cursor: "pointer",
  },
  denyBtn: {
    padding: "0.45rem 0.85rem",
    background: "#fff",
    color: "#b91c1c",
    border: "1px solid #fecaca",
    borderRadius: "8px",
    fontWeight: 600,
    cursor: "pointer",
  },
  list: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "0.75rem" },
  request: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "1rem",
    padding: "0.85rem",
    background: "#f9fafb",
    borderRadius: "8px",
    border: "1px solid #eef0f2",
  },
  message: { margin: "0 0 0.25rem", fontWeight: 500 },
  meta: { margin: 0, fontSize: "0.8125rem", color: "#6b7280" },
  actions: { display: "flex", gap: "0.5rem", flexShrink: 0, flexWrap: "wrap" },
  empty: { margin: 0, color: "#6b7280", fontSize: "0.9375rem" },
  resolved: {
    display: "flex",
    alignItems: "flex-start",
    gap: "0.65rem",
    fontSize: "0.9375rem",
    padding: "0.5rem 0",
    borderBottom: "1px solid #f3f4f6",
  },
  badge: {
    fontSize: "0.6875rem",
    fontWeight: 700,
    letterSpacing: "0.04em",
    background: "#e5e7eb",
    padding: "0.15rem 0.45rem",
    borderRadius: "4px",
    flexShrink: 0,
  },
  form: { display: "flex", flexDirection: "column", gap: "0.75rem" },
  formTitle: { margin: 0, fontWeight: 600 },
  pre: {
    margin: "0.5rem 0 0",
    padding: "0.75rem",
    background: "#f9fafb",
    borderRadius: "8px",
    fontSize: "0.8125rem",
    overflow: "auto",
  },
  preSmall: {
    margin: "0.25rem 0 0",
    padding: "0.5rem",
    background: "#f9fafb",
    borderRadius: "6px",
    fontSize: "0.75rem",
    overflow: "auto",
  },
  logList: { listStyle: "none", margin: 0, padding: 0, fontSize: "0.8125rem" },
  logItem: { padding: "0.25rem 0" },
  logTime: { color: "#9ca3af", marginRight: "0.5rem", fontVariantNumeric: "tabular-nums" },
};
