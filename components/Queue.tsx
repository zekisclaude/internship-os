"use client";
import { useEffect, useMemo, useState } from "react";

type Check = { id: string; label: string; ok: boolean; hard: boolean };
type Item = { id: string; version: number; hash: string; data: any; checks: Check[] };
const TABS = [["review", "To review"], ["approved", "Approved, not sent"], ["sent", "Sent"], ["replied", "Replies"], ["other", "Skipped and rejected"]] as const;
const tabOf = (s: string) => s === "awaiting_approval" || s === "draft" ? "review" : s === "approved" ? "approved" : s === "sent" ? "sent" : s === "replied" ? "replied" : "other";
const LABEL: Record<string, [string, string]> = { published: ["Published address", "good"], verified_public: ["Published address", "good"], general_inbox: ["General inbox", "warn"], "pattern-inferred": ["Guessed address", "bad"] };

export default function Queue({ initial, sent, cap }: { initial: Item[]; sent: number; cap: number }) {
  const [items, setItems] = useState(initial);
  const [tab, setTab] = useState<string>("review");
  const [sel, setSel] = useState(0);
  const [edit, setEdit] = useState<string | null>(null);
  const [draft, setDraft] = useState({ to: "", subject: "", body: "" });
  const [msg, setMsg] = useState<{ t: string; bad?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [inferredOk, setInferredOk] = useState<Record<string, boolean>>({});
  const [sentCount, setSent] = useState(sent);
  const shown = useMemo(() => items.filter((i) => tabOf(i.data.status) === tab), [items, tab]);

  async function reload() {
    const r = await fetch("/api/queue", { cache: "no-store" });
    if (r.ok) { const j = await r.json(); setItems(j.items); setSent(j.sent); }
  }
  async function act(it: Item, action: string, extra: Record<string, unknown> = {}) {
    setBusy(true); setMsg(null);
    try {
      const r = await fetch(`/api/outreach/${encodeURIComponent(it.id)}/${action}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ hash: it.hash, ifVersion: it.version, ...extra }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.ok === false) { setMsg({ t: (j.error || "Failed") + (j.failed ? `: ${j.failed.join("; ")}` : ""), bad: true }); return false; }
      await reload();
      setMsg({ t: { approve: "Approved.", send: `Sent to ${it.data.to}.`, skip: "Skipped.", edit: "Saved. It needs approval again.", unapprove: "Approval removed." }[action] || "Done." });
      return true;
    } finally { setBusy(false); }
  }
  async function approveSend(it: Item) {
    if (it.data.status !== "approved") { const ok = await act(it, "approve", { allowInferred: !!inferredOk[it.id] }); if (!ok) return; }
    const fresh = await (await fetch("/api/queue", { cache: "no-store" })).json();
    const now = (fresh.items as Item[]).find((x) => x.id === it.id);
    if (!now) return;
    if (!confirm(`Send this email to ${now.data.to} now?`)) { setItems(fresh.items); return; }
    await act(now, "send");
  }
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (edit || (e.target as HTMLElement)?.tagName === "TEXTAREA" || (e.target as HTMLElement)?.tagName === "INPUT") return;
      const it = shown[sel]; if (!it) return;
      if (e.key === "j") setSel((s) => Math.min(s + 1, shown.length - 1));
      if (e.key === "k") setSel((s) => Math.max(s - 1, 0));
      if (e.key === "a" && !busy) act(it, "approve", { allowInferred: !!inferredOk[it.id] });
      if (e.key === "s" && !busy) act(it, "skip");
      if (e.key === "e") { setEdit(it.id); setDraft({ to: it.data.to || "", subject: it.data.subject || "", body: it.data.body || "" }); }
    }
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div>
      <h1>Review queue</h1>
      <p className="sub">Emails ChatGPT drafted. Nothing is sent until you approve that exact message and press send. Sent today: {sentCount} of {cap}. Keys: <span className="kbd">J</span>/<span className="kbd">K</span> move, <span className="kbd">A</span> approve, <span className="kbd">E</span> edit, <span className="kbd">S</span> skip.</p>
      <div className="tabs">{TABS.map(([k, l]) => <button key={k} className={"btn" + (tab === k ? " pri" : "")} onClick={() => { setTab(k); setSel(0); }}>{l} ({items.filter((i) => tabOf(i.data.status) === k).length})</button>)}</div>
      {msg && <div className={"msg " + (msg.bad ? "bad" : "good")}>{msg.t}</div>}
      {!shown.length && <div className="card mut">Nothing here.</div>}
      {shown.map((it, i) => {
        const o = it.data; const lab = LABEL[o.toStatus] || ["No address label", "bad"];
        const hardFail = it.checks.some((c) => c.hard && !c.ok);
        const flags = (o.reviewFlags || []).filter((f: any) => !f.resolved);
        return (
          <div key={it.id} className={"card" + (i === sel ? " sel" : "")} onClick={() => setSel(i)}>
            <div className="row">
              <b>{o.toName || o.contactName || "Unnamed"}</b><span className="mut">{o.toTitle ? `${o.toTitle}, ` : ""}{o.company}</span>
              {o.tier && <span className="pill acc">Tier {o.tier}</span>}
              <span className={"pill " + lab[1]}>{lab[0]}</span>
              {o.type === "follow-up" && <span className="pill">Follow-up</span>}
              <span className="sp" style={{ flex: 1 }} />
              <span className="mut small">v{o.version || 1}</span>
            </div>
            <div className="small" style={{ marginTop: 6 }}>To: <b>{o.to || "no address"}</b></div>
            {edit === it.id ? (
              <div style={{ marginTop: 10 }}>
                <input type="text" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} placeholder="to" />
                <div style={{ height: 6 }} />
                <input type="text" value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} placeholder="subject" />
                <div style={{ height: 6 }} />
                <textarea value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} />
                <div className="row" style={{ marginTop: 8 }}>
                  <button className="btn pri" disabled={busy} onClick={async () => { if (await act(it, "edit", draft)) setEdit(null); }}>Save</button>
                  <button className="btn" onClick={() => setEdit(null)}>Cancel</button>
                </div>
              </div>
            ) : (
              <>
                <div style={{ marginTop: 8 }}><b>{o.subject}</b></div>
                <pre className="body">{o.body}</pre>
              </>
            )}
            {(o.evidence || []).length > 0 && <div className="small mut">Hook: {(o.evidence || []).map((e: any, k: number) => <span key={k}>{e.claim || "source"} {e.url && <a href={e.url} target="_blank" rel="noreferrer">link</a>}{k < o.evidence.length - 1 ? "; " : ""}</span>)}</div>}
            {flags.length > 0 && <div className="msg bad small">Research flag: {flags.map((f: any) => f.reason).join(" | ")}</div>}
            <div className="checks">{it.checks.map((c) => <span key={c.id} className={"pill " + (c.ok ? "good" : c.hard ? "bad" : "warn")}>{c.ok ? "OK" : "Check"}: {c.label}</span>)}</div>
            {o.toStatus === "pattern-inferred" && ["awaiting_approval", "draft"].includes(o.status) && (
              <label className="small"><input type="checkbox" checked={!!inferredOk[it.id]} onChange={(e) => setInferredOk({ ...inferredOk, [it.id]: e.target.checked })} /> I know this address is a guess and want to send to it anyway</label>
            )}
            <div className="row" style={{ marginTop: 10 }}>
              {["awaiting_approval", "draft", "skipped"].includes(o.status) && <>
                <button className="btn pri" disabled={busy || hardFail || edit === it.id} onClick={() => approveSend(it)}>Approve and send</button>
                <button className="btn" disabled={busy || hardFail || edit === it.id} onClick={() => act(it, "approve", { allowInferred: !!inferredOk[it.id] })}>Approve only</button>
                <button className="btn" disabled={busy} onClick={() => { setEdit(it.id); setDraft({ to: o.to || "", subject: o.subject || "", body: o.body || "" }); }}>Edit</button>
                {o.status !== "skipped" && <button className="btn" disabled={busy} onClick={() => act(it, "skip")}>Skip</button>}
              </>}
              {o.status === "approved" && <>
                <button className="btn pri" disabled={busy} onClick={() => approveSend(it)}>Send now</button>
                <button className="btn" disabled={busy} onClick={() => act(it, "unapprove")}>Remove approval</button>
                <span className="small mut">Approved {String(o.approval?.at || "").slice(0, 16).replace("T", " ")} for {o.approval?.to}</span>
              </>}
              {o.sentAt && <span className="small mut">Sent {String(o.sentAt).slice(0, 16).replace("T", " ")}{o.followUpDue ? `, follow-up due ${o.followUpDue}` : ""}{o.gmailUrl && <> · <a href={o.gmailUrl} target="_blank" rel="noreferrer">open in Gmail</a></>}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
