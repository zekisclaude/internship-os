import { cookies } from "next/headers";
import { hmac, safeEqual } from "./crypto";

// Access: if SITE_PASSWORD is not set, the site is open and every visitor acts as the owner (the owner chose this).
// If SITE_PASSWORD is set, the owner unlocks the site with it and the browser is remembered for 30 days.
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
export function siteIsOpen(): boolean { return !process.env.SITE_PASSWORD; }
export async function currentUser(): Promise<{ email: string } | null> {
  if (siteIsOpen()) return { email: process.env.SENDER_GMAIL || OWNER };
  const c = await cookies();
  return readSession(c.get(NAME)?.value);
}
export const sessionCookie = { name: NAME, maxAge: MAX_AGE };
