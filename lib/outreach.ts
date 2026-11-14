import { sha256Hex } from "./crypto";

export type Outreach = Record<string, any>;
const EMAIL = /^[^\s@<>(),;:"]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

export function messageHash(id: string, o: Outreach): string {
  return sha256Hex(JSON.stringify([id, o.to || "", o.subject || "", o.body || ""]));
}
export function bodyWords(body: string): number {
  const main = (body || "").split(/\n\s*Thanks,\s*\n/)[0];
  return main.split(/\s+/).filter(Boolean).length;
}
export type Check = { id: string; label: string; ok: boolean; hard: boolean };

export function checks(o: Outreach, ctx: { optOut?: boolean; otherLive?: boolean }): Check[] {
  const w = bodyWords(o.body || "");
  const status = String(o.toStatus || "");
  return [
    { id: "email", label: "Valid email address", ok: EMAIL.test(o.to || ""), hard: true },
    { id: "optout", label: "Recipient has not opted out", ok: !o.suppressed && !ctx.optOut, hard: true },
    { id: "label", label: `Address label: ${status || "missing"}`, ok: ["published", "verified_public", "general_inbox", "pattern-inferred"].includes(status), hard: true },
    { id: "dash", label: "No em dashes", ok: !/[—]/.test(`${o.subject} ${o.body}`), hard: false },
    { id: "words", label: `Body length ${w} words (90 to 150)`, ok: w >= 90 && w <= 150, hard: false },
    { id: "subject", label: "Subject 3 to 7 words", ok: (o.subject || "").split(/\s+/).filter(Boolean).length <= 7 && (o.subject || "").split(/\s+/).filter(Boolean).length >= 3, hard: false },
    { id: "hook", label: "Personal hook with a source link", ok: Array.isArray(o.evidence) && o.evidence.some((e: any) => e && e.url), hard: false },
    { id: "dupe", label: "No other live first contact at this firm", ok: !ctx.otherLive, hard: false },
    { id: "flags", label: "No open research flags", ok: !(o.reviewFlags || []).some((f: any) => !f.resolved), hard: false },
  ];
}
export function addBusinessDays(d: Date, n: number): Date {
  const x = new Date(d);
  while (n > 0) { x.setUTCDate(x.getUTCDate() + 1); const day = x.getUTCDay(); if (day !== 0 && day !== 6) n--; }
  return x;
}
