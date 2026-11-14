import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { SCOPES } from "@/lib/gmail";

export async function GET() {
  const state = randomBytes(16).toString("hex");
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID || "",
    redirect_uri: `${process.env.APP_URL}/api/auth/callback`,
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  const res = NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${p}`);
  res.cookies.set("ios_oauth_state", state, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 600 });
  return res;
}
