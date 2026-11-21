// Owner-only: send one approved message through the connected Gmail account.
// Sends only the exact approved text. A journal claim stops double sends; an unclear result is never retried automatically.
import { fail, json, ownerOnly } from "@/lib/http";
import { gmailConnection, gmailToken } from "@/lib/gmail-auth";
import { approvedMessage, deleteDraft, priorMail, sendRawMessage } from "@/lib/gmail-send";
import { addBusinessDays } from "@/lib/outreach";
import { queueItems } from "@/lib/queue";
import { query } from "@/lib/db";
import { audit, write } from "@/lib/records";

export const maxDuration = 60;
export async function POST(req: Request) {
  const owner = await ownerOnly(req);
  if (!owner || !(await gmailConnection())) return fail(401, "Connect Gmail in this browser first.");
  const input = await req.json().catch(() => null);
  if (typeof input?.id !== "string" || typeof input?.hash !== "string") return fail(400, "Choose a current approved message first.");
  const item = (await queueItems()).find(r => r.id === input.id);
  if (!item) return fail(409, "This message is on hold or no longer available. Refresh the queue.");
  const hard = item.checks.filter(c => c.hard && !c.ok);
  if (hard.length) return fail(422, `Resolve these first: ${hard.map(c => c.label).join("; ")}`);
  let message;
  try { message = approvedMessage(item, input.hash); } catch (error) { return fail(409, (error as Error).message); }
  const done = await query("select state from gmail_send_exports where outreach_id=$1 and message_hash=$2", [message.id, message.hash]);
  if (done[0]?.state === "sent") return json({ status: "already_sent" });
  if (done[0]) return json({ status: "uncertain", reason: "An earlier attempt may have sent this. Check Gmail Sent before doing anything else; it will not be retried automatically." });
  let token: string;
  try {
    token = await gmailToken();
    if ((await priorMail(token, message.to)).length) return json({ status: "skipped", reason: "You already have sent or received mail with this recipient. Review Gmail, then use 'I sent it' if appropriate." });
  } catch { return fail(502, "Could not check Gmail. Nothing was sent. Try again or reconnect Gmail."); }
  const kind = item.data.type === "follow-up" ? "follow-up" : "initial";
  const claim = await query("insert into gmail_send_exports (outreach_id,message_hash,recipient,kind,state) values ($1,$2,$3,$4,'sending') on conflict do nothing returning outreach_id", [message.id, message.hash, message.to.trim().toLowerCase(), kind]);
  if (!claim.length) return json({ status: "uncertain", reason: "This recipient already has a send in progress or on record. Check Gmail Sent; nothing was sent now." });
  let sent: { id: string; threadId: string };
  try { sent = await sendRawMessage(token, message, process.env.SENDER_GMAIL!); }
  catch {
    await query("update gmail_send_exports set state='uncertain' where outreach_id=$1 and message_hash=$2 and state='sending'", [message.id, message.hash]);
    return json({ status: "uncertain", reason: "Gmail's answer could not be confirmed. Check Gmail Sent; this will not be retried automatically." });
  }
  await query("update gmail_send_exports set state='sent', gmail_message_id=$3, gmail_thread_id=$4 where outreach_id=$1 and message_hash=$2", [message.id, message.hash, sent.id, sent.threadId]);
  const at = new Date();
  const o = item.data;
  const history = [...(o.history || []), { at: at.toISOString(), event: "sent", by: owner.email, version: o.version || 1, via: "gmail api", gmailMessageId: sent.id }];
  const result = await write({ kind: "human", email: owner.email }, { collection: "outreach", id: message.id, ifVersion: item.version, patch: {
    status: "sent", sentAt: at.toISOString(), sentBy: process.env.SENDER_GMAIL, gmailMessageId: sent.id, gmailThreadId: sent.threadId,
    gmailUrl: sent.threadId ? `https://mail.google.com/mail/u/0/#all/${sent.threadId}` : "", followUpDue: addBusinessDays(at, 5).toISOString().slice(0, 10), history } }, { serverFields: true });
  await audit({ kind: "human", email: owner.email }, "send_outreach", `outreach/${message.id}`, `to ${message.to}, gmail ${sent.id}`);
  // Remove the matching saved draft, if there is one, so it cannot be sent twice by hand.
  const draft = await query("select gmail_draft_id from gmail_draft_exports where outreach_id=$1 and message_hash=$2 and state='created'", [message.id, message.hash]);
  if (draft[0]?.gmail_draft_id) { try { await deleteDraft(token, draft[0].gmail_draft_id); } catch { /* the message is already sent; leaving the draft is harmless */ } }
  return json({ status: "sent", gmailMessageId: sent.id, recorded: result.ok });
}
