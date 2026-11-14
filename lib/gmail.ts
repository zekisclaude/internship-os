// Gmail through Google's REST API with the owner's stored refresh token. Server side only.
import { query } from "./db";
import { decrypt, encrypt } from "./crypto";

export const SCOPES = ["openid", "email", "https://www.googleapis.com/auth/gmail.send", "https://www.googleapis.com/auth/gmail.readonly"];

export async function saveRefreshToken(email: string, token: string) {
  await query("insert into secrets (key,value) values ($1,$2) on conflict (key) do update set value=excluded.value, updated_at=now()",
    ["gmail_refresh_token", encrypt(JSON.stringify({ email, token }))]);
}
export async function gmailAccount(): Promise<{ email: string; token: string } | null> {
  const r = await query("select value from secrets where key=$1", ["gmail_refresh_token"]);
  if (!r.length) return null;
  try { return JSON.parse(decrypt(r[0].value)); } catch { return null; }
}
async function accessToken(): Promise<{ token: string; email: string }> {
  const acct = await gmailAccount();
  if (!acct) throw new Error("Gmail is not connected. Sign out and sign in again to grant Gmail access.");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, refresh_token: acct.token, grant_type: "refresh_token" }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(`Google token refresh failed: ${j.error || res.status}`);
  return { token: j.access_token, email: acct.email };
}
async function gmail(path: string, init: RequestInit = {}) {
  const { token } = await accessToken();
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, { ...init, headers: { ...(init.headers || {}), authorization: `Bearer ${token}`, "content-type": "application/json" } });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Gmail ${path.split("?")[0]} failed: ${j.error?.message || res.status}`);
  return j;
}
function encodeHeader(v: string) {
  return /^[\x20-\x7e]*$/.test(v) ? v : `=?UTF-8?B?${Buffer.from(v, "utf8").toString("base64")}?=`;
}
export function buildMime(o: { from: string; to: string; subject: string; body: string; inReplyTo?: string }): string {
  const lines = [`From: ${o.from}`, `To: ${o.to}`, `Subject: ${encodeHeader(o.subject)}`, "MIME-Version: 1.0", "Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: 8bit"];
  if (o.inReplyTo) lines.push(`In-Reply-To: ${o.inReplyTo}`, `References: ${o.inReplyTo}`);
  return Buffer.from(lines.join("\r\n") + "\r\n\r\n" + o.body.replace(/\r?\n/g, "\r\n"), "utf8").toString("base64url");
}
export async function alreadySent(to: string, subject: string): Promise<boolean> {
  const q = `in:sent to:${to} subject:"${subject.replace(/"/g, "")}" newer_than:60d`;
  const j = await gmail(`messages?maxResults=1&q=${encodeURIComponent(q)}`);
  return (j.resultSizeEstimate || 0) > 0 && Array.isArray(j.messages) && j.messages.length > 0;
}
export async function send(o: { to: string; subject: string; body: string; threadId?: string; inReplyTo?: string }) {
  const acct = await gmailAccount();
  const raw = buildMime({ from: acct!.email, ...o });
  const j = await gmail("messages/send", { method: "POST", body: JSON.stringify({ raw, ...(o.threadId ? { threadId: o.threadId } : {}) }) });
  return { messageId: j.id as string, threadId: j.threadId as string, from: acct!.email };
}
export async function thread(id: string) {
  return gmail(`threads/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`);
}
