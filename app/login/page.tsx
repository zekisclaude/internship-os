const ERR: Record<string, string> = {
  wrong: "Wrong password.",
  locked: "Too many wrong tries. Wait 15 minutes.",
  setup: "The site is not set up yet: add SITE_PASSWORD in Vercel and redeploy.",
};
export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <div className="card" style={{ maxWidth: 420, margin: "80px auto" }}>
      <h1>Internship OS</h1>
      <p className="sub">Private. Enter the site password. This browser stays unlocked for 30 days.</p>
      {error && <div className="msg bad">{ERR[error] || "Could not unlock."}</div>}
      <form action="/api/auth/password" method="post">
        <input type="password" name="password" autoFocus autoComplete="current-password" style={{ width: "100%", font: "inherit", padding: 8, borderRadius: 8, border: "1px solid var(--line)", background: "var(--bg)", color: "var(--fg)" }} />
        <div style={{ height: 10 }} />
        <button className="btn pri">Unlock</button>
      </form>
    </div>
  );
}
