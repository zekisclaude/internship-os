"use client";
import { useEffect, useRef, useState } from "react";
import { approveOne, canApprove, canSend, sendOne, type SendItem, type SendResult } from "@/lib/send-client";

const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
// Staggered sending (owner request 2026-11-21): 15 emails, then a 15 minute pause, repeated. The browser tab drives the schedule.
export const BATCH = 15;
export const GAP_MS = 15 * 60 * 1000;
export default function SendCenter({ items, reload, cap, sentToday, showList = false }: { items: SendItem[]; reload: () => Promise<void>; cap: number; sentToday: number; showList?: boolean }) {
  const [gmail, setGmail] = useState<{ configured: boolean; connected: boolean } | null>(null);
  const [panel, setPanel] = useState<"approve" | "send" | null>(null);
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<SendResult[]>([]);
  const [error, setError] = useState("");
  const running = useRef(false);
  const stopRequested = useRef(false);
  const [mode, setMode] = useState<"batches" | "now">("batches");
  const [nextAt, setNextAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { if (!nextAt) return; const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, [nextAt]);
  useEffect(() => { fetch("/api/gmail/status", { cache: "no-store" }).then(r => r.json()).then(setGmail).catch(() => setError("Could not check the Gmail connection.")); }, []);
  const toApprove = items.filter(canApprove);
  const approved = items.filter(canSend);
  const toSend = cap > 0 ? approved.slice(0, Math.max(0, cap - sentToday)) : approved;
  const connected = !!gmail?.connected;
  const label = (id: string) => { const o = items.find(i => i.id === id)?.data; return o ? `${o.toName || id} (${o.to})` : id; };

  async function connect() {
    setBusy(true); setError("");
    try { const r = await fetch("/api/gmail/connect", { method: "POST" }); const j = await r.json(); if (!r.ok || !j.url) throw new Error(j.error || "Could not connect Gmail."); window.location.assign(j.url); }
    catch (e) { setError((e as Error).message); setBusy(false); }
  }
  async function run(kind: "approve" | "send") {
    if (running.current) return;
    running.current = true; stopRequested.current = false; setBusy(true); setResults([]); setError("");
    // Snapshot the exact set shown in the confirmation. Anything that changes afterward is refused by the server.
    const set = (kind === "approve" ? toApprove : toSend).map(i => ({ ...i }));
    try {
      for (let n = 0; n < set.length; n++) {
        const res = kind === "approve" ? await approveOne(set[n]) : await sendOne(set[n]);
        setResults(old => [...old, res]);
        if ((res as any).stop) { setError(res.reason || "Stopped. Check Gmail before continuing."); break; }
        if (kind === "send" && n < set.length - 1) {
          if (mode === "batches" && (n + 1) % BATCH === 0) {
            const until = Date.now() + GAP_MS; setNextAt(until); setNow(Date.now());
            while (Date.now() < until && !stopRequested.current) await wait(1000);
            setNextAt(null);
            if (stopRequested.current) { setError("Stopped. The remaining messages stay approved; press Send all to continue."); break; }
          } else await wait(2500);
        }
        if (stopRequested.current) { setError("Stopped. The remaining messages stay approved; press Send all to continue."); break; }
      }
    } finally { setNextAt(null); await reload(); running.current = false; setBusy(false); setPanel(null); setAck(false); }
  }
  async function sendIndividually(it: SendItem) {
    if (running.current) return;
    if (!window.confirm(`Send this email to ${it.data.to} now? It goes from your Gmail and cannot be undone.`)) return;
    running.current = true; setBusy(true); setResults([]); setError("");
    try { const res = await sendOne(it); setResults([res]); if (res.status !== "sent") setError(res.reason || "Not sent."); } finally { await reload(); running.current = false; setBusy(false); }
  }
  const count = (s: string) => results.filter(r => r.status === s).length;
  return <section className="card" aria-label="Approve and send">
    <b>Approve and send</b>
    <p className="small">Approve all and Send all act on the exact messages listed in the confirmation. Each send goes to the recipient shown, with the text you approved, one at a time. Sent today: {sentToday}.</p>
    <div className="row">
      <button className="btn" disabled={busy || !toApprove.length} onClick={() => { setPanel(panel === "approve" ? null : "approve"); setAck(false); }}>Approve all ({toApprove.length})</button>
      <button className="btn pri" disabled={busy || !connected || !toSend.length} onClick={() => { setPanel(panel === "send" ? null : "send"); setAck(false); }}>Send all ({toSend.length}{approved.length > toSend.length ? ` of ${approved.length}` : ""})</button>
      {gmail?.configured && !connected && <button className="btn" disabled={busy} onClick={connect}>Connect Gmail to send</button>}
    </div>
    {gmail && !gmail.configured && <p className="small">Sending needs the Gmail connection set up first. <a href="/settings">View settings</a>.</p>}
    {gmail?.configured && !connected && <p className="small">Connect Gmail in this browser to enable sending. Until then, use "Open in Gmail".</p>}
    {approved.length > toSend.length && <p className="small">Daily limit: only {toSend.length} will send now; the rest stay approved for tomorrow.</p>}
    {panel && <div className="card" style={{ marginTop: 10 }}>
      <b>{panel === "approve" ? `Approve these ${toApprove.length} messages` : mode === "now" ? `Send these ${toSend.length} emails now` : `Send these ${toSend.length} emails, ${BATCH} now and ${BATCH} every ${GAP_MS / 60000} minutes`}</b>
      <ul className="small">{(panel === "approve" ? toApprove : toSend).map(i => <li key={i.id}><b>{i.data.to}</b>: {i.data.subject}</li>)}</ul>
      {panel === "send" && <fieldset className="small" style={{ border: 0, padding: 0, margin: "8px 0" }}>
        <legend><b>How to send</b></legend>
        <label><input type="radio" name="sendmode" checked={mode === "batches"} disabled={busy} onChange={() => setMode("batches")} /> In batches: {BATCH} now, then {BATCH} every {GAP_MS / 60000} minutes{toSend.length > BATCH ? ` (about ${(Math.ceil(toSend.length / BATCH) - 1) * GAP_MS / 60000} minutes in all, keep this tab open)` : ""}</label><br />
        <label><input type="radio" name="sendmode" checked={mode === "now"} disabled={busy} onChange={() => setMode("now")} /> All now, about 2.5 seconds apart</label>
      </fieldset>}
      {panel === "send" && <p className="msg bad small">This sends real email from your Gmail{mode === "now" ? " right away" : ", the first " + Math.min(BATCH, toSend.length) + " right away"}. If you close the tab, the rest stay approved and you can press Send all again. Sent email cannot be taken back.</p>}
      <label className="small"><input type="checkbox" checked={ack} onChange={e => setAck(e.target.checked)} /> I reviewed this exact list{panel === "send" ? " and the messages are approved as written" : ""}.</label>
      <div className="row" style={{ marginTop: 8 }}>
        <button className={"btn " + (panel === "send" ? "pri" : "")} disabled={!ack || busy} onClick={() => run(panel)}>{panel === "approve" ? "Approve" : "Send"} {(panel === "approve" ? toApprove : toSend).length}</button>
        <button className="btn" disabled={busy} onClick={() => setPanel(null)}>Cancel</button>
      </div>
    </div>}
    {busy && <p role="status">{nextAt ? `Next ${BATCH} send in ${Math.max(0, Math.ceil((nextAt - now) / 1000 / 60))} min. ` : "Working… "}{results.length} done.{" "}<button className="btn" onClick={() => { stopRequested.current = true; }}>Stop after this message</button></p>}
    {!!results.length && <div role="status"><p>{count("approved")} approved, {count("sent") + count("already_sent")} sent, {count("skipped")} skipped, {count("uncertain")} need checking, {count("failed")} failed.</p>
      <ul className="small">{results.filter(r => r.reason).map(r => <li key={r.id}>{label(r.id)}: {r.reason}</li>)}</ul></div>}
    {error && <p role="alert" className="msg bad">{error}</p>}
    {showList && <div style={{ marginTop: 12 }}>
      <b>Approved, ready to send ({approved.length})</b>
      {!approved.length && <p className="mut small">Nothing approved yet. Approve messages in the Review queue first.</p>}
      {approved.map(it => <div className="line" key={it.id}>
        <span className="grow"><b>{it.data.toName || it.id}</b> <span className="mut small">{it.data.company}</span><div className="small">{it.data.to}: {it.data.subject}</div></span>
        <button className="btn pri" disabled={busy || !connected} onClick={() => sendIndividually(it)}>Send</button>
      </div>)}
    </div>}
  </section>;
}
export function useSendOne(reload: () => Promise<void>) { return { send: async (it: SendItem) => { const r = await sendOne(it); await reload(); return r; } }; }
