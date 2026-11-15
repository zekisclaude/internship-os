import { requireUser } from "@/lib/guard";
import { list } from "@/lib/records";
import { faithAligned } from "@/lib/faith";
export const dynamic = "force-dynamic";
export default async function Page({ searchParams }: { searchParams: Promise<{ faith?: string }> }) {
  await requireUser();
  const { faith } = await searchParams;
  const all = (await list("companies")).map((r) => ({ id: r.id, ...r.data })).sort((a: any, b: any) => (b.score ?? 0) - (a.score ?? 0)) as any[];
  const rows = faith ? all.filter(faithAligned) : all;
  return (<div>
    <h1>Companies</h1>
    <p className="sub">{all.length} firms. Claude researches them; ChatGPT picks who to email.</p>
    <div className="filters"><a href="/companies" className={!faith ? "on" : ""}>All</a><a href="/companies?faith=1" className={faith ? "on" : ""}>Faith-aligned ({all.filter(faithAligned).length})</a></div>
    <div className="tablewrap"><table><thead><tr><th>Score</th><th>Firm</th><th>Where</th><th>Why</th><th>Outreach</th></tr></thead><tbody>
      {rows.map((c) => <tr key={c.id}><td className="score">{c.score ?? "-"}</td><td><b>{c.name}</b>{faithAligned(c) && <> <span className="pill faith">Faith-aligned</span></>}<div className="small mut">{c.track}</div></td><td className="small">{c.hq}</td><td className="small">{c.why}</td><td><span className="pill">{c.outreachStatus || "Researching"}</span></td></tr>)}
    </tbody></table></div>
  </div>);
}
