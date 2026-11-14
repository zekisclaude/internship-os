import { requireUser } from "@/lib/guard";
import { list } from "@/lib/records";
export const dynamic = "force-dynamic";
export default async function Page() {
  await requireUser();
  const rows = (await list("companies")).map((r) => ({ id: r.id, ...r.data })).sort((a: any, b: any) => (b.score ?? 0) - (a.score ?? 0));
  return (<div>
    <h1>Companies</h1>
    <p className="sub">{rows.length} firms. Claude researches them; ChatGPT picks who to email.</p>
    <div className="tablewrap"><table><thead><tr><th>Score</th><th>Firm</th><th>Where</th><th>Why</th><th>Outreach</th></tr></thead><tbody>
      {rows.map((c: any) => <tr key={c.id}><td>{c.score ?? "-"}</td><td><b>{c.name}</b><div className="small mut">{c.track}</div></td><td className="small">{c.hq}</td><td className="small">{c.why}</td><td><span className="pill">{c.outreachStatus || "Researching"}</span></td></tr>)}
    </tbody></table></div>
  </div>);
}
