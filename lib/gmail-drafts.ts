import { messageHash } from "./outreach";

export type DraftMessage = { id: string; hash: string; to: string; subject: string; body: string };
export function rawDraft(message: DraftMessage, sender: string) {
  if (/[\r\n]/.test(message.to + sender + message.subject)) throw new Error("Invalid email header.");
  const subject = Buffer.from(message.subject).toString("base64");
  const body = Buffer.from(message.body).toString("base64").match(/.{1,76}/g)?.join("\r\n") || "";
  return Buffer.from([
    `From: ${sender}`, `To: ${message.to}`, `Subject: =?UTF-8?B?${subject}?=`,
    `Message-ID: <${message.hash}@internship-os.invalid>`, "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: base64", "", body,
  ].join("\r\n")).toString("base64url");
}
export async function gmailApi(token: string, path: string, body?: unknown, request = fetch, method?: "PUT") {
  const response = await request(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
    method: method || (body === undefined ? "GET" : "POST"), headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(20000), redirect: "error",
  });
  if (!response.ok) throw new Error("Gmail request failed. Reconnect Gmail if access expired.");
  return response.json();
}
// Retrieve every page. Failure stops export rather than treating an incomplete
// search as proof there is no previous draft, sent message, reply, or bounce.
export async function existingCorrespondence(token: string, email: string, request = fetch) {
  let page: string | undefined;
  const ids: string[] = [];
  do {
    const params = new URLSearchParams({ q: `in:anywhere {to:${email} from:${email}}`, maxResults: "500" });
    if (page) params.set("pageToken", page);
    const result = await gmailApi(token, `messages?${params}`, undefined, request);
    ids.push(...(result.messages || []).map((m: { id: string }) => m.id));
    page = result.nextPageToken;
  } while (page);
  return ids;
}
export function selectedMessage(record: { id: string; data: Record<string, any> }, hash: string): DraftMessage {
  const o = record.data;
  if (messageHash(record.id, o) !== hash) throw new Error("The message changed. Refresh and review it again.");
  if (!["draft", "awaiting_approval", "approved"].includes(o.status)) throw new Error("This message is not an active draft.");
  if (["cc", "bcc", "attachments"].some(k => o[k] && o[k].length)) throw new Error("CC, BCC and attachments are not supported by bulk drafts.");
  if (!o.subject?.trim() || !o.body?.trim()) throw new Error("Subject and body are required.");
  return { id: record.id, hash, to: o.to, subject: o.subject, body: o.body };
}
