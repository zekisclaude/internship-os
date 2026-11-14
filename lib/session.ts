import { cookies } from "next/headers";
import { hmac, safeEqual } from "./crypto";

// No accounts: the owner unlocks the site with SITE_PASSWORD and the browser is remembered for 30 days.
const NAME = "ios_session";
const MAX_AGE = 60 * 60 * 24 * 30;
export const OWNER = "owner";

export function makeSession(): string {
  const payload = Buffer.from(JSON.stringify({ who: OWNER, exp: Date.now() + MAX_AGE * 1000, v: passwordStamp() })).toString("base64url");
  return `${payload}.${hmac(payload)}`;
}
// Changing SITE_PASSWORD logs out every remembered browser.
function passwordStamp(): string { return hmac(`pw:${process.env.SITE_PASSWORD || ""}`).slice(0, 12); }
export function readSession(token?: string | null): { email: string } | null {
  if (!token || !process.env.SITE_PASSWORD) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig || !safeEqual(sig, hmac(payload))) return null;
  try {
    const p = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (p.who !== OWNER || p.exp < Date.now() || p.v !== passwordStamp()) return null;
    return { email: process.env.GMAIL_ADDRESS || OWNER };
  } catch { return null; }
}
export async function currentUser(): Promise<{ email: string } | null> {
  const c = await cookies();
  return readSession(c.get(NAME)?.value);
}
export const sessionCookie = { name: NAME, maxAge: MAX_AGE };
