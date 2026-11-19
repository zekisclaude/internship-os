export type SendItem = { id: string; hash: string; version: number; data: any; checks: { id: string; label: string; ok: boolean; hard: boolean }[] };
export type SendResult = { id: string; status: "sent" | "already_sent" | "skipped" | "uncertain" | "failed" | "approved"; reason?: string };
export const hardOk = (it: SendItem) => !it.checks.some(c => c.hard && !c.ok);
export const canApprove = (it: SendItem) => ["awaiting_approval", "draft"].includes(it.data.status) && hardOk(it);
export const canSend = (it: SendItem) => it.data.status === "approved" && hardOk(it);

// Approve exactly the version shown. The server re-checks everything, and any edit clears the approval.
export async function approveOne(it: SendItem, request = fetch): Promise<SendResult> {
  const r = await request(`/api/outreach/${encodeURIComponent(it.id)}/approve`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ hash: it.hash, ifVersion: it.version }) });
  const j = await r.json().catch(() => ({}));
  return r.ok && j.ok !== false ? { id: it.id, status: "approved" } : { id: it.id, status: "failed", reason: (j.error || "Could not approve") + (j.failed ? `: ${j.failed.join("; ")}` : "") };
}
// Send exactly the approved text. The server refuses a changed message, an unapproved one, a repeat, or a recipient with earlier mail.
export async function sendOne(it: { id: string; hash: string }, request = fetch): Promise<SendResult & { stop?: boolean }> {
  try {
    const r = await request("/api/send", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: it.id, hash: it.hash }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { id: it.id, status: "failed", reason: j.error || "Could not send", stop: [401, 429, 502, 503].includes(r.status) };
    return { id: it.id, status: j.status, reason: j.reason, stop: j.status === "uncertain" };
  } catch { return { id: it.id, status: "uncertain", reason: "Connection interrupted. Check Gmail Sent before trying again.", stop: true }; }
}
