import { list } from "./records";
import { checks, hasVerifiedRecipientRoute, isActiveDraft, messageHash, type Outreach } from "./outreach";

export function hasOtherInitial(id: string, o: Outreach, out: { id: string; data: Outreach }[]): boolean {
  if (o.type === "follow-up") return false;
  const name = (s: unknown) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  return out.some((r) => r.id !== id && r.data.type !== "follow-up"
    && ["draft", "awaiting_approval", "approved", "sent", "replied"].includes(r.data.status)
    && ((o.companyId && r.data.companyId === o.companyId)
      || (name(o.company) && name(o.company) === name(r.data.company))));
}

export async function queueState() {
  const [out, contacts] = await Promise.all([list("outreach"), list("contacts")]);
  const byId = new Map(contacts.map((c) => [c.id, c.data]));
  const held = out.filter((r) => isActiveDraft(r.data) && !hasVerifiedRecipientRoute(r.data, byId.get(r.data.contactId)));
  const heldIds = new Set(held.map((r) => r.id));
  // Newest first: most recently added or changed message at the top.
  const stamp = (r: { updated_at: string }) => new Date(r.updated_at).getTime() || 0;
  const items = out.filter((r) => !heldIds.has(r.id)).sort((a, b) => stamp(b) - stamp(a) || a.id.localeCompare(b.id)).map((r) => {
    const o = r.data;
    const contact = byId.get(o.contactId);
    return { id: r.id, version: r.version, data: o, hash: messageHash(r.id, o),
      checks: checks(o, { contact, optOut: !!contact?.optOut, otherLive: hasOtherInitial(r.id, o, out) }) };
  });
  return { items, heldCount: held.length };
}

export async function queueItems() {
  return (await queueState()).items;
}
export async function sentToday(): Promise<number> {
  const day = new Date().toISOString().slice(0, 10);
  return (await list("outreach")).filter((r) => String(r.data.sentAt || "").startsWith(day)).length;
}
