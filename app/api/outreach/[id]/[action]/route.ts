// Owner-only actions on one message: approve, unapprove, edit, skip, send.
// Approval is bound to the exact recipient, subject and body the owner saw (a hash). Any edit clears it.
import { fail, json, ownerOnly } from "@/lib/http";
import { get, write, audit } from "@/lib/records";
import { addBusinessDays, checks, messageHash } from "@/lib/outreach";
import { alreadySent, send } from "@/lib/gmail";
import { sentToday } from "@/lib/queue";
import { query } from "@/lib/db";

export async function POST(req: Request, ctx: { params: Promise<{ id: string; action: string }> }) {
  const u = await ownerOnly(req);
  if (!u) return fail(401, "owner sign-in required");
  const { id, action } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const rec = await get("outreach", id);
  if (!rec) return fail(404, "not found");
  const o = rec.data;
  const actor = { kind: "human" as const, email: u.email };
  const hash = messageHash(id, o);

  if (action === "edit") {
    const patch: Record<string, unknown> = {};
    for (const k of ["to", "subject", "body", "toStatus"]) if (typeof body[k] === "string") patch[k] = body[k];
    const r = await write(actor, { collection: "outreach", id, patch, ifVersion: body.ifVersion });
    return json(r, r.ok ? 200 : 409);
  }
  if (action === "skip" || action === "unapprove") {
    const patch = action === "skip" ? { status: "skipped" } : { status: "awaiting_approval" };
    const r = await write(actor, { collection: "outreach", id, patch: { ...patch, approval: null }, ifVersion: body.ifVersion }, { serverFields: true });
    return json(r, r.ok ? 200 : 409);
  }
  if (action === "approve") {
    if (body.hash !== hash) return fail(409, "the message changed since you opened it; reload and review again");
    if (!["awaiting_approval", "draft", "skipped"].includes(o.status)) return fail(409, `cannot approve a message with status ${o.status}`);
    const contact = o.contactId ? await get("contacts", o.contactId) : null;
    const hard = checks(o, { optOut: !!contact?.data.optOut }).filter((c) => c.hard && !c.ok);
    if (hard.length) return fail(422, "fix before approving", { failed: hard.map((c) => c.label) });
    if (o.toStatus === "pattern-inferred" && body.allowInferred !== true) return fail(422, "this address is a guess from the firm's email format; tick the box to approve it anyway");
    const approval = { version: o.version || 1, hash, to: o.to, at: new Date().toISOString(), by: u.email, allowInferred: o.toStatus === "pattern-inferred" };
    const history = [...(o.history || []), { at: approval.at, event: "approved", by: u.email, version: approval.version }];
    const r = await write(actor, { collection: "outreach", id, patch: { status: "approved", approval, history }, ifVersion: rec.version }, { serverFields: true });
    if (r.ok) await audit(actor, "approve_outreach", `outreach/${id}`, `v${approval.version} to ${o.to}`);
    return json(r, r.ok ? 200 : 409);
  }
  if (action === "send") {
    if (o.status !== "approved" || !o.approval) return fail(409, "approve this exact message first");
    if (o.approval.hash !== hash || o.approval.to !== o.to) return fail(409, "the message changed after approval; approve it again");
    if (body.hash !== hash) return fail(409, "the message changed since you opened it; reload");
    if (o.sentAt) return fail(409, "already sent");
    const contact = o.contactId ? await get("contacts", o.contactId) : null;
    const hard = checks(o, { optOut: !!contact?.data.optOut }).filter((c) => c.hard && !c.ok);
    if (hard.length) return fail(422, "blocked", { failed: hard.map((c) => c.label) });
    const cap = Number(process.env.DAILY_SEND_CAP || 15);
    if ((await sentToday()) >= cap) return fail(429, `daily limit of ${cap} reached`);
    // Claim the send so a double click cannot send twice.
    const claim = await query("update records set data = data || '{\"sending\":true}'::jsonb, version=version+1 where collection='outreach' and id=$1 and version=$2 and not (data ? 'sending' and (data->>'sending')::boolean) returning version", [id, rec.version]);
    if (!claim.length) return fail(409, "already sending or changed; reload");
    try {
      if (await alreadySent(o.to, o.subject)) throw new Error("a message with this subject to this address is already in Sent mail");
      const s = await send({ to: o.to, subject: o.subject, body: o.body, threadId: o.replyToThreadId, inReplyTo: o.inReplyTo });
      const now = new Date();
      const history = [...(o.history || []), { at: now.toISOString(), event: "sent", by: u.email, version: o.version || 1, gmailMessageId: s.messageId }];
      const r = await write(actor, { collection: "outreach", id, ifVersion: claim[0].version, patch: {
        status: "sent", sending: false, sentAt: now.toISOString(), sentBy: s.from, gmailMessageId: s.messageId, gmailThreadId: s.threadId,
        gmailUrl: `https://mail.google.com/mail/u/0/#sent/${s.threadId}`, followUpDue: addBusinessDays(now, 5).toISOString().slice(0, 10), history } }, { serverFields: true });
      await audit(actor, "send_outreach", `outreach/${id}`, `to ${o.to}, gmail ${s.messageId}`);
      return json({ ...r, gmailMessageId: s.messageId, gmailThreadId: s.threadId });
    } catch (e: any) {
      await query("update records set data = data - 'sending', version=version+1 where collection='outreach' and id=$1", [id]);
      await audit(actor, "send_failed", `outreach/${id}`, String(e.message || e));
      return fail(502, String(e.message || e));
    }
  }
  return fail(404, "unknown action");
}
