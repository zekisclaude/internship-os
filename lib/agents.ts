import { safeEqual } from "./crypto";

export type Actor = { kind: "agent"; name: "claude" | "chatgpt" } | { kind: "human"; email: string };

export function agentFromRequest(req: Request): Actor | null {
  const h = req.headers.get("authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  const t = m[1].trim();
  const c = process.env.CLAUDE_AGENT_TOKEN, g = process.env.CHATGPT_AGENT_TOKEN;
  if (c && c.length >= 32 && safeEqual(t, c)) return { kind: "agent", name: "claude" };
  if (g && g.length >= 32 && safeEqual(t, g)) return { kind: "agent", name: "chatgpt" };
  return null;
}
export function actorLabel(a: Actor): string {
  return a.kind === "agent" ? a.name : `owner:${a.email}`;
}
