import { gmailApi, rawDraft, type DraftMessage } from "./gmail-drafts";
import { messageHash } from "./outreach";

// Sending is done only from the exact text the owner approved. These helpers are pure so they can be tested without a mailbox.
export function approvedMessage(record: { id: string; data: Record<string, any> }, hash: string): DraftMessage {
  const o = record.data;
  if (messageHash(record.id, o) !== hash) throw new Error("The message changed. Refresh and review it again.");
  if (o.status !== "approved" || !o.approval) throw new Error("Approve this exact message first.");
  if (o.approval.hash !== hash || String(o.approval.to || "").toLowerCase() !== String(o.to || "").toLowerCase()) throw new Error("The message changed after approval. Approve it again.");
  if (o.sentAt) throw new Error("This message was already sent.");
  if (["cc", "bcc", "attachments"].some(k => o[k] && o[k].length)) throw new Error("CC, BCC and attachments are not supported.");
  if (!o.subject?.trim() || !o.body?.trim()) throw new Error("Subject and body are required.");
  return { id: record.id, hash, to: o.to, subject: o.subject, body: o.body };
}
// Earlier mail with this person, excluding drafts (a saved Gmail draft of this same message must not block sending it).
export async function priorMail(token: string, email: string, request = fetch) {
  let page: string | undefined;
  const ids: string[] = [];
  do {
    const params = new URLSearchParams({ q: `in:anywhere -in:drafts {to:${email} from:${email}}`, maxResults: "500" });
    if (page) params.set("pageToken", page);
    const result = await gmailApi(token, `messages?${params}`, undefined, request);
    ids.push(...(result.messages || []).map((m: { id: string }) => m.id));
    page = result.nextPageToken;
  } while (page);
  return ids;
}
export async function sendRawMessage(token: string, message: DraftMessage, sender: string, request = fetch) {
  const result = await gmailApi(token, "messages/send", { raw: rawDraft(message, sender) }, request);
  if (!result.id) throw new Error("Missing message ID");
  return { id: String(result.id), threadId: String(result.threadId || "") };
}
// Best effort: remove a saved draft of the same message so it cannot be sent a second time by hand.
export async function deleteDraft(token: string, draftId: string, request = fetch) {
  const r = await request(`https://gmail.googleapis.com/gmail/v1/users/me/drafts/${encodeURIComponent(draftId)}`, { method: "DELETE", headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20000), redirect: "error" });
  return r.ok;
}
