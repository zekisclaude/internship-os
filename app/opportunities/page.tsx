import { requireUser } from "@/lib/guard";
import { list } from "@/lib/records";
export const dynamic = "force-dynamic";
const tone = (s: string) => s === "Confirmed eligible" || s === "Low apparent conflict" ? "good" : s === "Ineligible" || s === "High direct-involvement concern" ? "bad" : "warn";
export default async function Page() {
  await requireUser();
  const rows = (await list("opportunities")).map((r) => ({ id: r.id, ...r.data }));
  const active = rows.filter((o: any) => o.status !== "Archived").sort((a: any, b: any) => (b.score ?? -1) - (a.score ?? -1));
  const archived = rows.length - active.length;
  return (<div>
    <h1>Opportunities</h1>
    <p className="sub">{active.length} active, {archived} archived. Research by Claude; scores are out of 100.</p>
    <div className="tablewrap"><table><thead><tr><th>Score</th><th>Role</th><th>Where</th><th>Pay</th><th>Eligibility</th><th>Screening</th><th>Deadline</th></tr></thead><tbody>
      {active.map((o: any) => <tr key={o.id}>
        <td>{o.score ?? "-"}</td>
        <td><a href={o.url?.startsWith("http") ? o.url : undefined} target="_blank" rel="noreferrer"><b>{o.employer}</b></a><div className="small">{o.title}</div><div className="small mut">{o.next}</div></td>
        <td className="small">{o.loc}</td>
        <td className="small">{o.comp?.text}</td>
        <td><span className={"pill " + tone(o.elig?.status)}>{o.elig?.status}</span></td>
        <td><span className={"pill " + tone(o.riba?.status)}>{o.riba?.status}</span></td>
        <td className="small">{o.deadline?.date || o.deadline?.type}</td>
      </tr>)}
    </tbody></table></div>
  </div>);
}
