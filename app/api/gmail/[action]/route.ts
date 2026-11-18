import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createHash } from "node:crypto";
import { fail, json, ownerOnly } from "@/lib/http";
import { GMAIL_COOKIE, STATE_COOKIE, callbackUrl, disconnectGmail, gmailConfigured, gmailConnection, nonce, saveConnection, sign, tokenRequest, verify } from "@/lib/gmail-auth";

const options = { httpOnly: true, secure: true, sameSite: "lax" as const, path: "/" };
export async function GET(req: Request, ctx: { params: Promise<{ action: string }> }) {
  const { action } = await ctx.params;
  if (action === "status") return json({ configured: gmailConfigured(), connected: !!(await gmailConnection()) });
  if (action !== "callback") return fail(404, "not found");
  const jar = await cookies();
  const state = verify(jar.get(STATE_COOKIE)?.value);
  jar.delete(STATE_COOKIE);
  const url = new URL(req.url);
  if (!state || state.state !== url.searchParams.get("state") || !url.searchParams.get("code")) return fail(400, "Gmail connection was cancelled or expired. Try again.");
  try {
    const tokens = await tokenRequest({ grant_type: "authorization_code", code: url.searchParams.get("code")!, redirect_uri: callbackUrl(), code_verifier: state.verifier });
    const profile = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { authorization: `Bearer ${tokens.access_token}` }, signal: AbortSignal.timeout(20000) });
    const user = await profile.json();
    if (!profile.ok || user.email_verified !== true || String(user.email).toLowerCase() !== process.env.SENDER_GMAIL?.toLowerCase()) return fail(403, "Connect the Gmail account configured for Internship OS.");
    const scopes = new Set(String(tokens.scope || "").split(" "));
    if (!scopes.has("https://www.googleapis.com/auth/gmail.compose") || !scopes.has("https://www.googleapis.com/auth/gmail.readonly")) return fail(403, "Draft creation and mailbox checks both need Google consent. Connect again and allow both.");
    if (!tokens.refresh_token) return fail(400, "Google did not grant offline access. Reconnect Gmail and approve access.");
    const session = await saveConnection(tokens.refresh_token);
    const response = NextResponse.redirect(new URL("/queue", process.env.APP_URL), 303);
    response.cookies.set(GMAIL_COOKIE, session, { ...options, maxAge: 30 * 86400 });
    return response;
  } catch { return fail(400, "Could not connect Gmail. Check the Google OAuth configuration and try again."); }
}
export async function POST(req: Request, ctx: { params: Promise<{ action: string }> }) {
  if (!(await ownerOnly(req))) return fail(401, "Open this action from Internship OS.");
  const { action } = await ctx.params;
  if (action === "connect") {
    if (!gmailConfigured()) return fail(503, "Gmail setup is required. Configure the Google OAuth client in Vercel first.");
    const host = req.headers.get("host") || new URL(req.url).host;
    if (host !== new URL(callbackUrl()).host) return fail(409, `Connect Gmail from ${new URL(callbackUrl()).origin}/queue so Google can return to the same browser session.`);
    const state = nonce(), verifier = nonce();
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.search = new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID!, redirect_uri: callbackUrl(), response_type: "code", scope: "openid email https://www.googleapis.com/auth/gmail.compose https://www.googleapis.com/auth/gmail.readonly", state, code_challenge: createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: "S256", access_type: "offline", prompt: "consent", login_hint: process.env.SENDER_GMAIL! }).toString();
    const response = json({ url: url.href });
    response.cookies.set(STATE_COOKIE, sign({ state, verifier, exp: Date.now() + 10 * 60e3 }), { ...options, maxAge: 600 });
    return response;
  }
  if (action === "disconnect") {
    try { await disconnectGmail(); } catch { return fail(502, "Could not revoke Gmail access. Please try again."); }
    const response = json({ ok: true }); response.cookies.delete(GMAIL_COOKIE); return response;
  }
  return fail(404, "not found");
}
