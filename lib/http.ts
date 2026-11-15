import { NextResponse } from "next/server";
import { agentFromRequest, type Actor } from "./agents";
import { currentUser, siteIsOpen } from "./session";

export const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "cache-control": "no-store" } });
export const fail = (status: number, error: string, extra: Record<string, unknown> = {}) => json({ error, ...extra }, status);

export async function actorFor(req: Request): Promise<Actor | null> {
  const a = agentFromRequest(req);
  if (a) return a;
  // On an open site, writing through the agent API always needs an agent token.
  if (siteIsOpen() && req.method !== "GET") return null;
  const u = await currentUser();
  if (u) {
    // Cookie-authenticated writes must come from this site's own pages.
    if (req.method !== "GET") {
      const origin = req.headers.get("origin");
      const app = process.env.APP_URL;
      if (origin && app && new URL(origin).host !== new URL(app).host) return null;
    }
    return { kind: "human", email: u.email };
  }
  return null;
}
export async function ownerOnly(req: Request): Promise<{ email: string } | null> {
  if (agentFromRequest(req)) return null;
  const u = await currentUser();
  if (!u) return null;
  const origin = req.headers.get("origin");
  const app = process.env.APP_URL;
  if (req.method !== "GET" && (!origin || !app || new URL(origin).host !== new URL(app).host)) return null;
  return u;
}
