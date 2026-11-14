import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { saveRefreshToken } from "@/lib/gmail";
import { makeSession, owners, sessionCookie } from "@/lib/session";
import { audit } from "@/lib/records";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const app = process.env.APP_URL!;
  const c = await cookies();
  const state = c.get("ios_oauth_state")?.value;
  if (!state || state !== url.searchParams.get("state")) return NextResponse.redirect(`${app}/login?error=state`);
  const code = url.searchParams.get("code");
  if (!code) return NextResponse.redirect(`${app}/login?error=${encodeURIComponent(url.searchParams.get("error") || "no_code")}`);
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, redirect_uri: `${app}/api/auth/callback`, grant_type: "authorization_code" }),
  });
  const tok = await res.json();
  if (!res.ok || !tok.id_token) return NextResponse.redirect(`${app}/login?error=token`);
  // The id_token came straight from Google's token endpoint over TLS, so its claims can be read directly.
  const claims = JSON.parse(Buffer.from(tok.id_token.split(".")[1], "base64url").toString());
  const email = String(claims.email || "").toLowerCase();
  if (!claims.email_verified || !owners().includes(email)) {
    await audit(`google:${email || "unknown"}`, "login_refused", "auth", "not on OWNER_EMAILS");
    return NextResponse.redirect(`${app}/login?error=not_allowed`);
  }
  const granted = String(tok.scope || "");
  if (email === owners()[0] && tok.refresh_token && granted.includes("gmail.send")) await saveRefreshToken(email, tok.refresh_token);
  await audit(`owner:${email}`, "login", "auth", granted.includes("gmail.send") ? "gmail send granted" : "gmail not granted");
  const out = NextResponse.redirect(`${app}/`);
  out.cookies.set(sessionCookie.name, makeSession(email), { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: sessionCookie.maxAge });
  out.cookies.delete("ios_oauth_state");
  return out;
}
