import { fail, json, ownerOnly } from "@/lib/http";
import { gmailConnection, gmailToken } from "@/lib/gmail-auth";
import { existingCorrespondence, gmailApi, rawDraft, selectedMessage } from "@/lib/gmail-drafts";
import { queueItems } from "@/lib/queue";
import { query } from "@/lib/db";
import { audit } from "@/lib/records";

export const maxDuration = 60;
export async function POST(req: Request) {
  const owner = await ownerOnly(req);
  // Public page access never grants mailbox access; only a browser that completed
  // OAuth for the configured sender can perform exports.
  if (!owner || !(await gmailConnection())) return fail(401, "Connect Gmail in this browser first.");
  const input = await req.json().catch(() => null);
  if (typeof input?.id !== "string" || typeof input?.hash !== "string") return fail(400, "Choose a current draft first.");
  const item = (await queueItems()).find(r => r.id === input.id);
  if (!item) return fail(409, "Draft is on hold or no longer available. Refresh the queue.");
  if (item.checks.some(c => c.hard && !c.ok)) return fail(422, "Resolve the draft's recipient or research checks first.");
  let message;
  try { message = selectedMessage(item, input.hash); } catch (error) { return fail(409, (error as Error).message); }
  const journal = await query("select * from gmail_draft_exports where outreach_id=$1 and message_hash=$2", [message.id, message.hash]);
  if (journal[0]?.state === "created") return json({ status: "already_added", gmailDraftId: journal[0].gmail_draft_id });
  // An edited message that already has a saved draft updates that same Gmail draft in place.
  const earlier = (await query("select * from gmail_draft_exports where outreach_id=$1 and state='created' and message_hash<>$2", [message.id, message.hash]))[0];
  let token: string;
  let ownMessageId = "";
  try {
    token = await gmailToken();
    if (earlier?.gmail_draft_id) {
      try { ownMessageId = (await gmailApi(token, `drafts/${earlier.gmail_draft_id}`)).message?.id || ""; } catch { /* draft was deleted in Gmail: fall through to a fresh create */ }
    }
    // Our own saved draft is not earlier correspondence; anything else with this recipient still blocks.
    const previous = (await existingCorrespondence(token, message.to)).filter(id => id !== ownMessageId);
    if (previous.length) return json({ status: "skipped", reason: "Existing Gmail draft or correspondence with this recipient. Review Gmail before adding another." });
  } catch { return fail(502, "Could not check Gmail. No new draft was created. Try again or reconnect Gmail."); }
  if (earlier && ownMessageId) {
    // Claim by moving the journal row to the new version before the external call.
    const moved = await query("update gmail_draft_exports set message_hash=$3, recipient=$4, state='updating' where outreach_id=$1 and message_hash=$2 and state='created' returning outreach_id", [message.id, earlier.message_hash, message.hash, message.to.trim().toLowerCase()]);
    if (!moved.length) return json({ status: "uncertain", reason: "Another update is in progress. Check Gmail before retrying." });
    try {
      const result = await gmailApi(token, `drafts/${earlier.gmail_draft_id}`, { message: { raw: rawDraft(message, process.env.SENDER_GMAIL!) } }, fetch, "PUT");
      if (!result.id) throw new Error("Missing draft ID");
      await query("update gmail_draft_exports set state='created',gmail_draft_id=$3 where outreach_id=$1 and message_hash=$2", [message.id, message.hash, result.id]);
      await audit("owner:gmail", "gmail_draft_updated", `outreach/${message.id}`, "Saved Gmail draft replaced with the edited message; outreach approval unchanged");
      return json({ status: "updated", gmailDraftId: result.id });
    } catch {
      await query("update gmail_draft_exports set state='uncertain' where outreach_id=$1 and message_hash=$2 and state='updating'", [message.id, message.hash]);
      return json({ status: "uncertain", reason: "Gmail's result could not be confirmed. Check Drafts; this update will not be repeated automatically." });
    }
  }
  if (earlier) await query("delete from gmail_draft_exports where outreach_id=$1 and message_hash=$2 and state='created'", [message.id, earlier.message_hash]);
  // Claim before the external call. A timeout or process failure must never cause
  // an automatic duplicate create on retry, even if Gmail's search index lags.
  const claimed = await query("insert into gmail_draft_exports (outreach_id,message_hash,recipient,state) values ($1,$2,$3,'creating') on conflict do nothing returning outreach_id", [message.id, message.hash, message.to.trim().toLowerCase()]);
  if (!claimed.length) return json({ status: "uncertain", reason: "An earlier attempt may have created this draft. Check Gmail before retrying; no duplicate was created." });
  try {
    const result = await gmailApi(token, "drafts", { message: { raw: rawDraft(message, process.env.SENDER_GMAIL!) } });
    if (!result.id) throw new Error("Missing draft ID");
    await query("update gmail_draft_exports set state='created',gmail_draft_id=$3 where outreach_id=$1 and message_hash=$2", [message.id, message.hash, result.id]);
    await audit("owner:gmail", "gmail_draft_created", `outreach/${message.id}`, "Unsent draft saved; outreach approval unchanged");
    return json({ status: "created", gmailDraftId: result.id });
  } catch {
    await query("update gmail_draft_exports set state='uncertain' where outreach_id=$1 and message_hash=$2 and state='creating'", [message.id, message.hash]);
    return json({ status: "uncertain", reason: "Gmail's result could not be confirmed. Check Drafts; this attempt will not be repeated automatically." });
  }
}
