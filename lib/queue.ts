import { list } from "./records";
import { checks, messageHash } from "./outreach";

export async function queueItems() {
  const [out, contacts] = await Promise.all([list("outreach"), list("contacts")]);
  const optOut = new Set(contacts.filter((c) => c.data.optOut).map((c) => c.id));
  const liveByCompany = new Map<string, number>();
  for (const o of out) if (["awaiting_approval", "approved", "sent"].includes(o.data.status) && o.data.type !== "follow-up" && o.data.companyId)
    liveByCompany.set(o.data.companyId, (liveByCompany.get(o.data.companyId) || 0) + 1);
  return out.map((r) => {
    const o = r.data;
    const otherLive = (liveByCompany.get(o.companyId) || 0) > 1;
    return { id: r.id, version: r.version, data: o, hash: messageHash(r.id, o), checks: checks(o, { optOut: optOut.has(o.contactId), otherLive }) };
  });
}
export async function sentToday(): Promise<number> {
  const day = new Date().toISOString().slice(0, 10);
  return (await list("outreach")).filter((r) => String(r.data.sentAt || "").startsWith(day)).length;
}
