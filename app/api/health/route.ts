import { json } from "@/lib/http";
// Public status check. Reports only whether each setting is present, never a value.
export async function GET() {
  const has = (k: string) => !!process.env[k];
  let database = "not configured";
  if (has("DATABASE_URL")) {
    try { const { query } = await import("@/lib/db"); await query("select 1"); database = "ok"; } catch { database = "error"; }
  }
  return json({ ok: database === "ok", database, access: has("SITE_PASSWORD") ? "password" : "open", senderGmail: has("SENDER_GMAIL"),
    secrets: ["SESSION_SECRET", "ENCRYPTION_KEY"].every(has), agents: { claude: has("CLAUDE_AGENT_TOKEN"), chatgpt: has("CHATGPT_AGENT_TOKEN") } });
}
