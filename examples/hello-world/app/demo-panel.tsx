"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";

interface ApprovalRecord {
  id: string;
  message: string;
  status: "pending" | "resolved";
  createdAt: string;
  resolvedAt?: string;
  result?: { type: string; reason?: string };
}

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

export function DemoPanel() {
  const [name, setName] = useState("world");
  const [pending, setPending] = useState<ApprovalRecord[]>([]);
  const [resolved, setResolved] = useState<ApprovalRecord[]>([]);
  const [lastRun, setLastRun] = useState<RunResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);

  const pushLog = useCallback((text: string, tone?: LogEntry["tone"]) => {
    setLogs((prev) => [
      { time: new Date().toLocaleTimeString(), text, tone },
      ...prev.slice(0, 19),
    ]);
  }, []);

  const refresh = useCallback(async () => {
    const [pendingRes, resolvedRes] = await Promise.all([
      fetch("/api/inbox?status=pending"),
      fetch("/api/inbox?status=resolved"),
    ]);
    const pendingBody = await readJson<{ approvals: ApprovalRecord[] }>(pendingRes);
    const resolvedBody = await readJson<{ approvals: ApprovalRecord[] }>(resolvedRes);
    setPending(pendingBody.approvals);
    setResolved(resolvedBody.approvals.slice(0, 8));
  }, []);

  useEffect(() => {
    void refresh().catch((err: unknown) => {
      pushLog(err instanceof Error ? err.message : "Failed to load approvals", "err");
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

  async function decide(id: string, decision: "approve" | "deny") {
    setBusy(true);
    try {
      const res = await fetch("/api/inbox", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, decision, by: { name: "demo-ui" } }),
      });
      await readJson<{ result: { type: string } }>(res);
      pushLog(`${decision === "approve" ? "Approved" : "Denied"} ${id}`, decision === "approve" ? "ok" : undefined);
      await refresh();
    } catch (err) {
      pushLog(err instanceof Error ? err.message : "Failed to submit decision", "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <h1 style={styles.title}>hitldev hello-world</h1>
        <p style={styles.lead}>
          Start the workflow, then approve the pending request. After approval, check the dev server
          terminal for <code style={styles.code}>Hello, …!</code>
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
          <h2 style={styles.cardTitle}>2. Pending approvals</h2>
          <button style={styles.ghostBtn} onClick={() => void refresh()} disabled={busy}>
            Refresh
          </button>
        </div>
        {pending.length === 0 ? (
          <p style={styles.empty}>No pending approvals. Start a workflow above.</p>
        ) : (
          <ul style={styles.list}>
            {pending.map((item) => (
              <li key={item.id} style={styles.approval}>
                <div>
                  <p style={styles.message}>{item.message}</p>
                  <p style={styles.meta}>
                    <code style={styles.code}>{item.id}</code> · {new Date(item.createdAt).toLocaleString()}
                  </p>
                </div>
                <div style={styles.actions}>
                  <button
                    style={styles.approveBtn}
                    disabled={busy}
                    onClick={() => void decide(item.id, "approve")}
                  >
                    Approve
                  </button>
                  <button
                    style={styles.denyBtn}
                    disabled={busy}
                    onClick={() => void decide(item.id, "deny")}
                  >
                    Deny
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {resolved.length > 0 && (
        <section style={styles.card}>
          <h2 style={styles.cardTitle}>Recently resolved</h2>
          <ul style={styles.list}>
            {resolved.map((item) => (
              <li key={item.id} style={styles.resolved}>
                <span style={styles.badge}>{item.result?.type ?? "RESOLVED"}</span>
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
  input: {
    padding: "0.55rem 0.75rem",
    border: "1px solid #d1d5db",
    borderRadius: "8px",
    fontSize: "1rem",
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
  approval: {
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
  actions: { display: "flex", gap: "0.5rem", flexShrink: 0 },
  empty: { margin: 0, color: "#6b7280", fontSize: "0.9375rem" },
  resolved: {
    display: "flex",
    alignItems: "center",
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
  logList: { listStyle: "none", margin: 0, padding: 0, fontSize: "0.8125rem" },
  logItem: { padding: "0.25rem 0" },
  logTime: { color: "#9ca3af", marginRight: "0.5rem", fontVariantNumeric: "tabular-nums" },
};
