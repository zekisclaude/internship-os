import { requireUser } from "@/lib/guard";
import { list } from "@/lib/records";
import { faithAligned } from "@/lib/faith";
export const dynamic = "force-dynamic";
const tone = (s: string) => s === "Confirmed eligible" || s === "Low apparent conflict" ? "good" : s === "Ineligible" || s === "High direct-involvement concern" ? "bad" : "warn";
const VIEWS: [string, string][] = [["eligible", "Eligible"], ["all", "All open"], ["leads", "Leads to check"], ["faith", "Faith-aligned"], ["archived", "Archived"]];
export default async function Page({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  await requireUser();
  const view = (await searchParams).view || "eligible";
  const rows = (await list("opportunities")).map((r) => ({ id: r.id, ...r.data })) as any[];
  const open = rows.filter((o) => o.status !== "Archived");
  const pick: Record<string, any[]> = {
    eligible: open.filter((o) => o.elig?.status === "Confirmed eligible"),
    all: open, leads: open.filter((o) => o.elig?.status !== "Confirmed eligible"),
    faith: open.filter(faithAligned), archived: rows.filter((o) => o.status === "Archived"),
  };
  const shown = (pick[view] || pick.eligible).sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  return (<div>
    <h1>Opportunities</h1>
    <p className="sub">Research by Claude. Scores are out of 100 and only count roles that pass eligibility, pay and screening.</p>
    <div className="filters">{VIEWS.map(([k, l]) => <a key={k} href={`/opportunities?view=${k}`} className={view === k ? "on" : ""}>{l} ({pick[k].length})</a>)}</div>
    <div className="tablewrap"><table><thead><tr><th>Score</th><th>Role</th><th>Where</th><th>Pay</th><th>Eligibility</th><th>Screening</th><th>Deadline</th></tr></thead><tbody>
      {shown.map((o) => <tr key={o.id}>
        <td className="score">{o.score ?? "-"}</td>
        <td><a href={o.url?.startsWith("http") ? o.url : undefined} target="_blank" rel="noreferrer"><b>{o.employer}</b></a>{faithAligned(o) && <> <span className="pill faith">Faith-aligned</span></>}<div className="small">{o.title}</div><div className="small mut">{view === "archived" ? o.archiveReason : o.next}</div></td>
        <td className="small">{o.loc}</td>
        <td className="small">{o.comp?.text}</td>
        <td><span className={"pill " + tone(o.elig?.status)}>{o.elig?.status}</span></td>
        <td><span className={"pill " + tone(o.riba?.status)}>{o.riba?.status}</span></td>
        <td className="small nowrap">{o.deadline?.date || o.deadline?.type}</td>
      </tr>)}
    </tbody></table></div>
  </div>);
}
