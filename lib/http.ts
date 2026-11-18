import { NextResponse } from "next/server";
import { agentFromRequest, type Actor } from "./agents";
import { currentUser, siteIsOpen } from "./session";

export const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "cache-control": "no-store" } });
export const fail = (status: number, error: string, extra: Record<string, unknown> = {}) => json({ error, ...extra }, status);

// Accept the actual request origin, including valid deployment aliases. APP_URL
// remains an accepted canonical origin; never trust Origin as its own allowlist.
export function sameSiteRequest(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  try {
    const value = new URL(origin).origin;
    if (value !== origin) return false;
    const requestUrl = new URL(req.url);
    // Next.js may use its bind hostname in req.url. Host is the actual HTTP
    // authority chosen by the browser; unlike Origin it cannot be set by page JS.
    const host = req.headers.get("host");
    const requestOrigin = host ? `${requestUrl.protocol}//${host}` : requestUrl.origin;
    return value === requestOrigin
      || (!!process.env.APP_URL && value === new URL(process.env.APP_URL).origin);
  } catch { return false; }
}

export async function actorFor(req: Request): Promise<Actor | null> {
  const a = agentFromRequest(req);
  if (a) return a;
  // On an open site, writing through the agent API always needs an agent token.
  if (siteIsOpen() && req.method !== "GET") return null;
  const u = await currentUser();
  if (u) {
    // Cookie-authenticated writes must come from this site's own pages.
    if (req.method !== "GET") {
      if (!sameSiteRequest(req)) return null;
    }
    return { kind: "human", email: u.email };
  }
  return null;
}
export async function ownerOnly(req: Request): Promise<{ email: string } | null> {
  if (agentFromRequest(req)) return null;
  const u = await currentUser();
  if (!u) return null;
  if (req.method !== "GET" && !sameSiteRequest(req)) return null;
  return u;
}
