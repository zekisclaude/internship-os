// Weekday reply detection. Marks a sent message as replied when someone else posts in its Gmail thread,
// and records the thread for ChatGPT to classify (cls 'Unclassified'). Read-only on Gmail.
import { fail, json } from "@/lib/http";
import { list, write, get } from "@/lib/records";
import { thread, gmailAccount } from "@/lib/gmail";
import { safeEqual } from "@/lib/crypto";

export async function GET(req: Request) {
  const want = process.env.CRON_SECRET;
  const got = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!want || !safeEqual(got, want)) return fail(401, "unauthorized");
  const acct = await gmailAccount();
  if (!acct) return json({ skipped: "gmail not connected" });
  const sys = { kind: "human" as const, email: "system:reply-check" };
  const out = (await list("outreach")).filter((r) => r.data.status === "sent" && r.data.gmailThreadId);
  let replies = 0; const errors: string[] = [];
  for (const r of out) {
    try {
      const t = await thread(r.data.gmailThreadId);
      const others = (t.messages || []).filter((m: any) => {
        const from = (m.payload?.headers || []).find((h: any) => h.name === "From")?.value || "";
        return !from.toLowerCase().includes(acct.email.toLowerCase());
      });
      if (!others.length) continue;
      const last = others[others.length - 1];
      const hdr = (n: string) => (last.payload?.headers || []).find((h: any) => h.name === n)?.value || "";
      const existing = await get("threads", r.data.gmailThreadId);
      await write(sys, { collection: "threads", id: r.data.gmailThreadId, ifVersion: existing?.version, patch: {
        gmailThreadId: r.data.gmailThreadId, date: new Date(Number(last.internalDate)).toISOString(), from: hdr("From"), subject: hdr("Subject"), snippet: last.snippet || "",
        cls: existing?.data.cls || "Unclassified", company: r.data.company || "", companyId: r.data.companyId || "", contactId: r.data.contactId || "", outreachId: r.id,
        url: `https://mail.google.com/mail/u/0/#all/${r.data.gmailThreadId}`, needsAction: true } }, { serverFields: true });
      await write(sys, { collection: "outreach", id: r.id, ifVersion: r.version, patch: { status: "replied", followUpDue: null } }, { serverFields: true });
      replies++;
    } catch (e: any) { errors.push(`${r.id}: ${e.message}`); }
  }
  const runId = `run-${new Date().toISOString().slice(0, 10)}-replies`;
  const prev = await get("runs", runId);
  await write(sys, { collection: "runs", id: runId, ifVersion: prev?.version, patch: { type: "reply detection", completedAt: new Date().toISOString(), counts: { checked: out.length, replies }, errors } }, { serverFields: true });
  return json({ checked: out.length, replies, errors });
}
