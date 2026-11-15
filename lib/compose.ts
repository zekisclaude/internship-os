// No Gmail credentials on the server. An approved message opens in the owner's own Gmail, already filled in,
// and the owner presses Send there. The site records that it was opened and, after a click, that it was sent.
export function gmailComposeUrl(o: { to: string; subject: string; body: string }): string {
  const p = new URLSearchParams({ view: "cm", fs: "1", to: o.to, su: o.subject, body: o.body });
  const acct = process.env.SENDER_GMAIL;
  if (acct) p.set("authuser", acct);
  return `https://mail.google.com/mail/?${p.toString()}`;
}
