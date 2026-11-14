import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { SCOPES } from "@/lib/gmail";

export async function GET() {
  const missing = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "DATABASE_URL"].filter((k) => !process.env[k]);
  if (missing.length) return NextResponse.redirect(`${process.env.APP_URL}/login?error=setup&missing=${missing.join(",")}`);
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
