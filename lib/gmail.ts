// Gmail with an app password: send over SMTP, look things up over IMAP. Server side only.
// Settings: GMAIL_ADDRESS and GMAIL_APP_PASSWORD (16 characters, from Google Account > Security > App passwords).
import nodemailer from "nodemailer";
import { ImapFlow } from "imapflow";

export function gmailConfigured(): { email: string } | null {
  const email = process.env.GMAIL_ADDRESS, pass = process.env.GMAIL_APP_PASSWORD;
  return email && pass ? { email } : null;
}
function creds() {
  const c = gmailConfigured();
  if (!c) throw new Error("Gmail is not connected. Add GMAIL_ADDRESS and GMAIL_APP_PASSWORD in Vercel and redeploy.");
  return { user: c.email, pass: (process.env.GMAIL_APP_PASSWORD || "").replace(/\s+/g, "") };
}
function smtp() {
  return nodemailer.createTransport({ host: "smtp.gmail.com", port: 465, secure: true, auth: creds() });
}
async function withImap<T>(mailbox: string, fn: (c: ImapFlow) => Promise<T>): Promise<T> {
  const c = new ImapFlow({ host: "imap.gmail.com", port: 993, secure: true, auth: creds(), logger: false });
  await c.connect();
  try {
    const lock = await c.getMailboxLock(mailbox);
    try { return await fn(c); } finally { lock.release(); }
  } finally { await c.logout().catch(() => {}); }
}
const ALL = "[Gmail]/All Mail", SENT = "[Gmail]/Sent Mail";
const hexThread = (id?: string) => (id ? BigInt(id).toString(16) : "");

export async function verify(): Promise<string> {
  await smtp().verify();
  await withImap("INBOX", async () => null);
  return "ok";
}
export async function alreadySent(to: string, subject: string): Promise<boolean> {
  return withImap(SENT, async (c) => {
    const hits = await c.search({ gmraw: `to:${to} subject:"${subject.replace(/"/g, "")}" newer_than:60d` });
    return Array.isArray(hits) && hits.length > 0;
  });
}
export async function send(o: { to: string; subject: string; body: string; inReplyTo?: string }) {
  const from = creds().user;
  const info = await smtp().sendMail({ from, to: o.to, subject: o.subject, text: o.body, ...(o.inReplyTo ? { inReplyTo: o.inReplyTo, references: o.inReplyTo } : {}) });
  const messageId = String(info.messageId || "");
  // Gmail puts the sent copy in Sent Mail; read its thread id so replies can be matched later.
  let threadId = "";
  for (let i = 0; i < 3 && !threadId; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    threadId = await withImap(ALL, async (c) => {
      const uids = await c.search({ gmraw: `rfc822msgid:${messageId.replace(/[<>]/g, "")}` });
      if (!Array.isArray(uids) || !uids.length) return "";
      const m = await c.fetchOne(String(uids[0]), { threadId: true }, { uid: true });
      return m && (m as any).threadId ? String((m as any).threadId) : "";
    }).catch(() => "");
  }
  return { messageId, threadId, from, url: threadId ? `https://mail.google.com/mail/u/0/#all/${hexThread(threadId)}` : "" };
}
// Messages in the thread that were not sent by the owner (replies).
export async function repliesInThread(threadId: string): Promise<{ from: string; subject: string; date: string; snippet: string }[]> {
  const me = creds().user.toLowerCase();
  return withImap(ALL, async (c) => {
    const uids = await c.search({ threadId });
    if (!Array.isArray(uids) || !uids.length) return [];
    const out: { from: string; subject: string; date: string; snippet: string }[] = [];
    for await (const m of c.fetch(uids.join(","), { envelope: true, bodyParts: ["TEXT"] }, { uid: true })) {
      const from = m.envelope?.from?.[0]?.address?.toLowerCase() || "";
      if (!from || from === me) continue;
      const text = m.bodyParts?.get("TEXT")?.toString("utf8") || "";
      out.push({ from, subject: m.envelope?.subject || "", date: new Date(m.envelope?.date || Date.now()).toISOString(), snippet: text.replace(/\s+/g, " ").slice(0, 200) });
    }
    return out;
  });
}
