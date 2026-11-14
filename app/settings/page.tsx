import { requireUser } from "@/lib/guard";
import { gmailConfigured } from "@/lib/gmail";
import GmailTest from "@/components/GmailTest";
import Importer from "@/components/Importer";
export const dynamic = "force-dynamic";
const yes = (v?: string) => (v ? "set" : "missing");
export default async function Page() {
  await requireUser();
  const g = gmailConfigured();
  return (<div>
    <h1>Settings</h1>
    <div className="card"><b>Gmail sending</b><p>{g ? <>Set up for <b>{g.email}</b> with an app password. Emails you approve go out from this account.</> : <>Not connected. Add GMAIL_ADDRESS and GMAIL_APP_PASSWORD in Vercel, then redeploy.</>}</p>{g && <GmailTest />}</div>
    <div className="card"><b>Agent access</b><p className="small">Claude token: {yes(process.env.CLAUDE_AGENT_TOKEN)}. ChatGPT token: {yes(process.env.CHATGPT_AGENT_TOKEN)}. Agents use the API described at <a href="/api/openapi">/api/openapi</a> with a bearer token. Claude may write research; ChatGPT may write drafts, contacts and replies. Neither can approve or send.</p></div>
    <Importer />
    <div className="card"><b>Limits</b><p className="small">Daily send limit: {process.env.DAILY_SEND_CAP || 15}. Reply detection runs on weekday mornings.</p></div>
  </div>);
}
