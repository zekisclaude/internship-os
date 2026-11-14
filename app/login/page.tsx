const ERR: Record<string, string> = {
  not_allowed: "That Google account is not allowed to use this site.",
  state: "The sign-in link expired. Try again.",
  token: "Google did not complete the sign-in. Try again.",
  access_denied: "Sign-in was cancelled.",
  setup: "The site is not fully set up yet.",
};
export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string; missing?: string }> }) {
  const { error, missing } = await searchParams;
  return (
    <div className="card" style={{ maxWidth: 460, margin: "80px auto" }}>
      <h1>Internship OS</h1>
      <p className="sub">Private. Sign in with the Google account this site was set up for. Google will also ask to let the site send email you approve and read replies.</p>
      {error && <div className="msg bad">{ERR[error] || "Sign-in failed."}{missing && <> Missing in Vercel: {missing.split(",").join(", ")}. Add them, then redeploy.</>}</div>}
      <a className="btn pri" href="/api/auth/login">Sign in with Google</a>
    </div>
  );
}
