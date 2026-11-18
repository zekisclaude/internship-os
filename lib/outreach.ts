import { sha256Hex } from "./crypto";

export type Outreach = Record<string, any>;
const EMAIL = /^[^\s@<>(),;:"]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
const VERIFIED = new Set(["published", "verified_public", "apollo_verified"]);

export function hasVerifiedRecipientRoute(o: Outreach, contact?: Outreach | null): boolean {
  const to = String(o.to || "").trim().toLowerCase();
  return EMAIL.test(to) && VERIFIED.has(o.toStatus) && !!contact
    && to === String(contact.email || "").trim().toLowerCase()
    && VERIFIED.has(contact.emailStatus)
    && !o.suppressed && !o.bounced && !contact.optOut && !contact.suppressed && !contact.bounced;
}

// Preserve terminal records for history; hold invalid active routes without deleting them.
export function isActiveDraft(o: Outreach): boolean {
  return ["draft", "awaiting_approval", "approved"].includes(o.status);
}

export function messageHash(id: string, o: Outreach): string {
  return sha256Hex(JSON.stringify([id, o.to || "", o.subject || "", o.body || ""]));
}
export function bodyWords(body: string): number {
  const main = (body || "").split(/\n\s*Thanks,\s*\n/)[0];
  return main.split(/\s+/).filter(Boolean).length;
}
export type Check = { id: string; label: string; ok: boolean; hard: boolean };

export function checks(o: Outreach, ctx: { contact?: Outreach | null; optOut?: boolean; otherLive?: boolean }): Check[] {
  const w = bodyWords(o.body || "");
  const status = String(o.toStatus || "");
  return [
    { id: "email", label: "Valid email address", ok: EMAIL.test(o.to || ""), hard: true },
    { id: "optout", label: "Recipient has not opted out", ok: !o.suppressed && !ctx.optOut, hard: true },
    { id: "route", label: "Recipient matches a verified, unsuppressed contact", ok: hasVerifiedRecipientRoute(o, ctx.contact), hard: true },
    // Owner rule: only verified addresses, meaning ones the firm or the person published. No guesses, no general inboxes.
    { id: "label", label: status === "pattern-inferred" ? "Address is a guess, not verified" : status === "general_inbox" ? "General inbox, not a verified personal address" : status === "apollo_verified" ? "Verified by Apollo" : status === "apollo_unverified" ? "Apollo could not verify this address" : ["published", "verified_public"].includes(status) ? "Verified: published address" : "Address not verified", ok: ["published", "verified_public", "apollo_verified"].includes(status), hard: true },
    { id: "dash", label: "No em dashes", ok: !/[—]/.test(`${o.subject} ${o.body}`), hard: false },
    { id: "words", label: `Body length ${w} words (90 to 150)`, ok: w >= 90 && w <= 150, hard: false },
    { id: "subject", label: "Subject 3 to 7 words", ok: (o.subject || "").split(/\s+/).filter(Boolean).length <= 7 && (o.subject || "").split(/\s+/).filter(Boolean).length >= 3, hard: false },
    { id: "hook", label: "Personal hook with a source link", ok: Array.isArray(o.evidence) && o.evidence.some((e: any) => e && e.url), hard: false },
    { id: "dupe", label: "No other live first contact at this firm", ok: !ctx.otherLive, hard: true },
    { id: "flags", label: "No open research flags", ok: !(o.reviewFlags || []).some((f: any) => !f.resolved), hard: true },
  ];
}
export function addBusinessDays(d: Date, n: number): Date {
  const x = new Date(d);
  while (n > 0) { x.setUTCDate(x.getUTCDate() + 1); const day = x.getUTCDay(); if (day !== 0 && day !== 6) n--; }
  return x;
}
