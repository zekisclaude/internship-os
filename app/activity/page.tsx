import { requireUser } from "@/lib/guard";
import { list } from "@/lib/records";
import { query } from "@/lib/db";
export const dynamic = "force-dynamic";
export default async function Page() {
  await requireUser();
  const feed = (await list("feed")).map((r) => r.data).sort((a: any, b: any) => String(b.date).localeCompare(String(a.date))).slice(0, 30);
  const runs = (await list("runs")).map((r) => ({ id: r.id, by: r.updated_by, ...r.data })).sort((a: any, b: any) => String(b.completedAt || "").localeCompare(String(a.completedAt || ""))).slice(0, 15);
  const audit = await query("select at, actor, action, target, detail from audit order by seq desc limit 60");
  return (<div>
    <h1>Activity</h1>
    <p className="sub">What Claude, ChatGPT and you changed.</p>
    <h3>Updates</h3>
    {feed.map((f: any, i) => <div className="card" key={i}><div className="row"><span className="pill">{f.type}</span><span className="mut small">{f.date}</span></div><b>{f.title}</b><div className="small">{f.body}</div></div>)}
    <h3>Runs</h3>
    <div className="tablewrap"><table><thead><tr><th>When</th><th>Run</th><th>By</th><th>Summary</th></tr></thead><tbody>
      {runs.map((r: any) => <tr key={r.id}><td className="small">{String(r.completedAt || "").slice(0, 16).replace("T", " ")}</td><td className="small">{r.type}</td><td className="small">{r.by}</td><td className="small">{r.digest || JSON.stringify(r.counts || {})}</td></tr>)}
    </tbody></table></div>
    <h3>Audit log</h3>
    <div className="tablewrap"><table><thead><tr><th>When</th><th>Who</th><th>Action</th><th>Record</th><th>Detail</th></tr></thead><tbody>
      {audit.map((a: any, i) => <tr key={i}><td className="small">{new Date(a.at).toISOString().slice(0, 16).replace("T", " ")}</td><td className="small">{a.actor}</td><td className="small">{a.action}</td><td className="small">{a.target}</td><td className="small">{a.detail}</td></tr>)}
    </tbody></table></div>
  </div>);
}
