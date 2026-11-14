import { cookies } from "next/headers";
import { hmac, safeEqual } from "./crypto";

const NAME = "ios_session";
const MAX_AGE = 60 * 60 * 24 * 7;

export function owners(): string[] {
  return (process.env.OWNER_EMAILS || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
}
export function makeSession(email: string): string {
  const payload = Buffer.from(JSON.stringify({ email, exp: Date.now() + MAX_AGE * 1000 })).toString("base64url");
  return `${payload}.${hmac(payload)}`;
}
export function readSession(token?: string | null): { email: string } | null {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig || !safeEqual(sig, hmac(payload))) return null;
  try {
    const p = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (typeof p.email !== "string" || p.exp < Date.now()) return null;
    if (!owners().includes(p.email.toLowerCase())) return null;
    return { email: p.email };
  } catch { return null; }
}
export async function currentUser(): Promise<{ email: string } | null> {
  const c = await cookies();
  return readSession(c.get(NAME)?.value);
}
export const sessionCookie = { name: NAME, maxAge: MAX_AGE };
