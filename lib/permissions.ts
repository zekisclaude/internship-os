// Who may write what. Humans (the signed-in owner) may write anything, but approval and sending
// only happen through the dedicated owner routes. Agents are limited by role.
import type { Actor } from "./agents";

export const COLLECTIONS = ["opportunities", "companies", "contacts", "outreach", "threads", "feed", "runs", "config"] as const;
export type Collection = (typeof COLLECTIONS)[number];

// Fields only the server sets (approval and send history). Nobody writes these through the record API.
export const SERVER_ONLY_OUTREACH = ["approval", "gmailMessageId", "gmailThreadId", "sentAt", "sentBy", "history"];
const AGENT_OUTREACH_STATUSES = ["draft", "awaiting_approval", "rejected", "archived"];

type Rule = { collections: Partial<Record<Collection, "all" | string[]>> };
const RULES: Record<"claude" | "chatgpt", Rule> = {
  // Claude: research. It may only add review flags to outreach, never change a message.
  claude: { collections: { opportunities: "all", companies: "all", feed: "all", runs: "all", outreach: ["reviewFlags"] } },
  // ChatGPT: recipients, drafts, replies, follow-ups. It cannot approve or send.
  chatgpt: { collections: { outreach: "all", contacts: "all", threads: "all", companies: ["outreachStatus"], feed: "all", runs: "all" } },
};

export function checkWrite(actor: Actor, collection: string, patch: Record<string, unknown>, existing: Record<string, any> | null): string | null {
  if (!(COLLECTIONS as readonly string[]).includes(collection)) return `unknown collection ${collection}`;
  if (collection === "outreach") {
    for (const f of SERVER_ONLY_OUTREACH) if (f in patch) return `field ${f} is set by the server only`;
    if ("status" in patch && ["approved", "sent", "replied"].includes(String(patch.status)) && actor.kind === "agent")
      return `agents cannot set status ${patch.status}`;
  }
  if (actor.kind === "human") return null;
  const allowed = RULES[actor.name].collections[collection as Collection];
  if (!allowed) return `${actor.name} may not write ${collection}`;
  if (allowed !== "all") {
    const bad = Object.keys(patch).filter((k) => !allowed.includes(k));
    if (bad.length) return `${actor.name} may not write ${collection} fields: ${bad.join(", ")}`;
    if (!existing) return `${actor.name} may not create ${collection} records`;
  }
  if (collection === "outreach" && actor.name === "chatgpt") {
    if ("status" in patch && !AGENT_OUTREACH_STATUSES.includes(String(patch.status))) return `status must be one of ${AGENT_OUTREACH_STATUSES.join(", ")}`;
    if (existing && ["sent", "replied"].includes(existing.status) && ["to", "subject", "body"].some((k) => k in patch))
      return "a sent message cannot be edited; create a follow-up record instead";
  }
  return null;
}
