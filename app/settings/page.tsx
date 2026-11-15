import { requireUser } from "@/lib/guard";
import Importer from "@/components/Importer";
export const dynamic = "force-dynamic";
const yes = (v?: string) => (v ? "set" : "missing");
export default async function Page() {
  await requireUser();
  return (<div>
    <h1>Settings</h1>
    <div className="card"><b>Sending</b><p className="small">The site holds no Gmail password. An approved email opens in your Gmail already filled in; you press Send there, then click "I sent it". {process.env.SENDER_GMAIL ? <>Gmail opens as <b>{process.env.SENDER_GMAIL}</b>.</> : <>Set SENDER_GMAIL in Vercel to open the right Gmail account when you have several.</>}</p></div>
    <div className="card"><b>Agent access</b><p className="small">Claude token: {yes(process.env.CLAUDE_AGENT_TOKEN)}. ChatGPT token: {yes(process.env.CHATGPT_AGENT_TOKEN)}. Agents use the API described at <a href="/api/openapi">/api/openapi</a> with a bearer token. Claude may write research; ChatGPT may write drafts, contacts and replies. Neither can approve or send.</p></div>
    <Importer />
    <div className="card"><b>Limits</b><p className="small">Daily send limit: {process.env.DAILY_SEND_CAP || 15}. ChatGPT marks replies when it finds them in Gmail.</p></div>
  </div>);
}
