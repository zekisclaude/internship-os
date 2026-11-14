// Weekday reply detection over IMAP. Marks a sent message as replied when someone else writes in its Gmail thread,
// and records the thread for ChatGPT to classify (cls 'Unclassified'). Reads only.
import { fail, json } from "@/lib/http";
import { list, write, get } from "@/lib/records";
import { gmailConfigured, repliesInThread } from "@/lib/gmail";
import { safeEqual } from "@/lib/crypto";

export const maxDuration = 60;
export async function GET(req: Request) {
  const want = process.env.CRON_SECRET;
  const got = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!want || !safeEqual(got, want)) return fail(401, "unauthorized");
  if (!gmailConfigured()) return json({ skipped: "gmail not connected" });
  const sys = { kind: "human" as const, email: "system:reply-check" };
  const out = (await list("outreach")).filter((r) => r.data.status === "sent" && r.data.gmailThreadId);
  let replies = 0; const errors: string[] = [];
  for (const r of out) {
    try {
      const others = await repliesInThread(String(r.data.gmailThreadId));
      if (!others.length) continue;
      const last = others[others.length - 1];
      const tid = String(r.data.gmailThreadId);
      const existing = await get("threads", tid);
      await write(sys, { collection: "threads", id: tid, ifVersion: existing?.version, patch: {
        gmailThreadId: tid, date: last.date, from: last.from, subject: last.subject, snippet: last.snippet,
        cls: existing?.data.cls || "Unclassified", company: r.data.company || "", companyId: r.data.companyId || "", contactId: r.data.contactId || "", outreachId: r.id,
        url: r.data.gmailUrl || "", needsAction: true } }, { serverFields: true });
      await write(sys, { collection: "outreach", id: r.id, ifVersion: r.version, patch: { status: "replied", followUpDue: null } }, { serverFields: true });
      replies++;
    } catch (e: any) { errors.push(`${r.id}: ${e.message}`); }
  }
  const runId = `run-${new Date().toISOString().slice(0, 10)}-replies`;
  const prev = await get("runs", runId);
  await write(sys, { collection: "runs", id: runId, ifVersion: prev?.version, patch: { type: "reply detection", completedAt: new Date().toISOString(), counts: { checked: out.length, replies }, errors } }, { serverFields: true });
  return json({ checked: out.length, replies, errors });
}
