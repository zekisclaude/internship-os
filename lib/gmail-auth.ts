import { cookies } from "next/headers";
import { randomBytes, createHash } from "node:crypto";
import { encrypt, decrypt, hmac, safeEqual } from "./crypto";
import { query } from "./db";

export const GMAIL_COOKIE = "ios_gmail";
export const STATE_COOKIE = "ios_gmail_state";
const credentialKey = "gmail_oauth_owner";
export function gmailConfigured() {
  return ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "SENDER_GMAIL", "SESSION_SECRET", "ENCRYPTION_KEY", "APP_URL"].every(k => !!process.env[k]);
}
export function callbackUrl() { return new URL("/api/gmail/callback", process.env.APP_URL).href; }
export const nonce = () => randomBytes(32).toString("base64url");
export function sign(value: object) {
  const payload = Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${payload}.${hmac(payload)}`;
}
export function verify(value: string | undefined): any | null {
  if (!value) return null;
  try {
    const [payload, signature, extra] = value.split(".");
    if (extra || !signature || !safeEqual(signature, hmac(payload))) return null;
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    return data.exp > Date.now() ? data : null;
  } catch { return null; }
}
export async function tokenRequest(params: Record<string, string>) {
  const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, ...params }), signal: AbortSignal.timeout(20000) });
  const data = await r.json();
  if (!r.ok || !data.access_token) throw new Error("Google authorization expired or was refused. Connect Gmail again.");
  return data;
}
export async function saveConnection(refreshToken: string) {
  const session = nonce();
  await query("insert into secrets (key,value) values ($1,$2) on conflict (key) do update set value=excluded.value, updated_at=now()", [credentialKey, encrypt(JSON.stringify({ refreshToken, sessionHash: createHash("sha256").update(session).digest("hex"), email: process.env.SENDER_GMAIL!.toLowerCase() }))]);
  return sign({ session, exp: Date.now() + 30 * 86400e3 });
}
export async function gmailConnection() {
  const session = verify((await cookies()).get(GMAIL_COOKIE)?.value);
  if (!session?.session) return null;
  const rows = await query("select value from secrets where key=$1", [credentialKey]);
  if (!rows.length) return null;
  try {
    const stored = JSON.parse(decrypt(rows[0].value));
    if (!safeEqual(stored.sessionHash, createHash("sha256").update(session.session).digest("hex")) || stored.email !== process.env.SENDER_GMAIL?.toLowerCase()) return null;
    return stored as { refreshToken: string; email: string; sessionHash: string };
  } catch { return null; }
}
export async function gmailToken() {
  const connection = await gmailConnection();
  if (!connection) throw new Error("Connect Gmail in this browser first.");
  return (await tokenRequest({ grant_type: "refresh_token", refresh_token: connection.refreshToken })).access_token as string;
}
export async function disconnectGmail() {
  const connection = await gmailConnection();
  if (!connection) return;
  const response = await fetch("https://oauth2.googleapis.com/revoke", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token: connection.refreshToken }), signal: AbortSignal.timeout(20000) });
  if (!response.ok && response.status !== 400) throw new Error("Google could not revoke access. Try again.");
  await query("delete from secrets where key=$1", [credentialKey]);
}
