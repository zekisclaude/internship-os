// Owner-only actions on one message: approve, unapprove, edit, skip, compose (open in Gmail), sent (mark as sent).
// Approval is bound to the exact recipient, subject and body the owner saw (a hash). Any edit clears it.
import { fail, json, ownerOnly } from "@/lib/http";
import { get, list, write, audit } from "@/lib/records";
import { addBusinessDays, checks, messageHash } from "@/lib/outreach";
import { gmailComposeUrl } from "@/lib/compose";
import { hasOtherInitial, sentToday } from "@/lib/queue";

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
    const hard = checks(o, { contact: contact?.data, optOut: !!contact?.data.optOut,
      otherLive: hasOtherInitial(id, o, await list("outreach")) }).filter((c) => c.hard && !c.ok);
    if (hard.length) return fail(422, "fix before approving", { failed: hard.map((c) => c.label) });
    const approval = { version: o.version || 1, hash, to: o.to, at: new Date().toISOString(), by: u.email };
    const history = [...(o.history || []), { at: approval.at, event: "approved", by: u.email, version: approval.version }];
    const r = await write(actor, { collection: "outreach", id, patch: { status: "approved", approval, history }, ifVersion: rec.version }, { serverFields: true });
    if (r.ok) await audit(actor, "approve_outreach", `outreach/${id}`, `v${approval.version} to ${o.to}`);
    return json(r, r.ok ? 200 : 409);
  }
  if (action === "compose" || action === "sent") {
    if (o.status !== "approved" || !o.approval) return fail(409, "approve this exact message first");
    if (o.approval.hash !== hash || o.approval.to !== o.to) return fail(409, "the message changed after approval; approve it again");
    if (body.hash !== hash) return fail(409, "the message changed since you opened it; reload");
    const contact = o.contactId ? await get("contacts", o.contactId) : null;
    const hard = checks(o, { contact: contact?.data, optOut: !!contact?.data.optOut,
      otherLive: hasOtherInitial(id, o, await list("outreach")) }).filter((c) => c.hard && !c.ok);
    if (hard.length) return fail(422, "blocked", { failed: hard.map((c) => c.label) });
    const now = new Date();
    if (action === "compose") {
      const cap = Number(process.env.DAILY_SEND_CAP || 15);
      if ((await sentToday()) >= cap) return fail(429, `daily limit of ${cap} reached`);
      const history = [...(o.history || []), { at: now.toISOString(), event: "opened_in_gmail", by: u.email, version: o.version || 1 }];
      await write(actor, { collection: "outreach", id, ifVersion: rec.version, patch: { openedInGmailAt: now.toISOString(), history } }, { serverFields: true });
      await audit(actor, "open_in_gmail", `outreach/${id}`, `to ${o.to}`);
      return json({ ok: true, url: gmailComposeUrl({ to: o.to, subject: o.subject, body: o.body }) });
    }
    const history = [...(o.history || []), { at: now.toISOString(), event: "sent", by: u.email, version: o.version || 1, via: "gmail compose" }];
    const r = await write(actor, { collection: "outreach", id, ifVersion: rec.version, patch: {
      status: "sent", sentAt: now.toISOString(), sentBy: process.env.SENDER_GMAIL || "owner", followUpDue: addBusinessDays(now, 5).toISOString().slice(0, 10), history } }, { serverFields: true });
    if (r.ok) await audit(actor, "mark_sent", `outreach/${id}`, `to ${o.to}`);
    return json(r, r.ok ? 200 : 409);
  }
  return fail(404, "unknown action");
}
