"use client";
import { useEffect, useRef, useState } from "react";

type Choice = { id: string; hash: string; data: { status: string }; checks: { hard: boolean; ok: boolean }[] };
type Result = { id: string; status: string; reason?: string };
export default function BulkGmailDrafts({ items, onComplete }: { items: Choice[]; onComplete: () => Promise<void> }) {
  const [connection, setConnection] = useState<{ configured: boolean; connected: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Result[]>([]);
  const [error, setError] = useState("");
  const running = useRef(false);
  const choices = items.filter(i => ["draft", "awaiting_approval", "approved"].includes(i.data.status) && !i.checks.some(c => c.hard && !c.ok));
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/gmail/status", { cache: "no-store", signal: controller.signal }).then(r => { if (!r.ok) throw new Error(); return r.json(); }).then(setConnection).catch(() => { if (!controller.signal.aborted) setError("Could not check Gmail connection. Refresh to try again."); });
    return () => controller.abort();
  }, []);
  async function connect() {
    setBusy(true); setError("");
    try {
      const r = await fetch("/api/gmail/connect", { method: "POST" }); const result = await r.json();
      if (!r.ok || !result.url) throw new Error(result.error || "Could not connect Gmail.");
      window.location.assign(result.url);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function disconnect() {
    setBusy(true); setError("");
    try {
      const r = await fetch("/api/gmail/disconnect", { method: "POST" });
      if (!r.ok) throw new Error("Could not revoke Gmail access. Try again.");
      setConnection(c => c && { ...c, connected: false });
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function addAll() {
    if (running.current) return;
    running.current = true; setBusy(true); setResults([]); setError("");
    // Snapshot the selected versions. The server refuses changed or held drafts.
    const selected = choices.map(({ id, hash }) => ({ id, hash }));
    try {
      for (const item of selected) {
        let result: Result;
        try {
          const r = await fetch("/api/gmail-drafts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(item) });
          const data = await r.json();
          result = { id: item.id, status: r.ok ? data.status : "failed", reason: data.reason || data.error };
          setResults(old => [...old, result]);
          if ([401, 502, 503].includes(r.status)) { setError(data.error || "Reconnect Gmail before continuing."); break; }
        } catch {
          setResults(old => [...old, { id: item.id, status: "uncertain", reason: "Connection interrupted. Check Gmail Drafts before trying again." }]);
          break;
        }
      }
      await onComplete();
    } catch { setError("Results above are saved. Refresh the queue to load its latest state."); }
    finally { running.current = false; setBusy(false); }
  }
  const count = (status: string) => results.filter(r => r.status === status).length;
  return <section className="card" aria-label="Save Gmail drafts">
    <b>Gmail drafts</b>
    <p className="small">Save eligible messages as separate, unsent Gmail drafts. Existing drafts and correspondence are skipped. This does not approve or send messages.</p>
    <div className="row">
      <button className="btn pri" disabled={busy || !connection?.connected || !choices.length} onClick={addAll}>Add all to Gmail drafts ({choices.length})</button>
      {connection?.configured && !connection.connected && <button className="btn" disabled={busy} onClick={connect}>Connect Gmail</button>}
      {connection?.connected && <button className="btn" disabled={busy} onClick={disconnect}>Disconnect Gmail</button>}
    </div>
    {connection && !connection.configured && <p className="small">The site’s Gmail connection needs setup before you can connect. <a href="/settings">View settings</a>.</p>}
    {busy && <p role="status">Working… {results.length} messages checked.</p>}
    {!!results.length && <div role="status"><p>{count("created")} added, {count("updated")} updated, {count("already_added")} already added, {count("skipped")} skipped, {count("uncertain")} need checking, {count("failed")} failed.</p>
      <ul>{results.filter(r => r.reason).map(r => <li key={r.id}>{r.id}: {r.reason}</li>)}</ul>
    </div>}
    {error && <p role="alert" className="msg bad">{error}</p>}
  </section>;
}
