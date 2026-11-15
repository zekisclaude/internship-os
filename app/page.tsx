import { requireUser } from "@/lib/guard";
import { list } from "@/lib/records";
import { faithAligned } from "@/lib/faith";

export const dynamic = "force-dynamic";
const DAY = 86400e3;
const fmt = (d: string) => new Date(d + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric" });

export default async function Dashboard() {
  await requireUser();
  const [opps, cos, out] = await Promise.all([list("opportunities"), list("companies"), list("outreach")]);
  const O = opps.map((r) => ({ id: r.id, ...r.data })) as any[];
  const C = cos.map((r) => ({ id: r.id, ...r.data })) as any[];
  const M = out.map((r) => ({ id: r.id, ...r.data })) as any[];
  const active = O.filter((o) => o.status !== "Archived" && o.kind !== "program" && o.kind !== "funding");
  const verified = active.filter((o) => o.elig?.status === "Confirmed eligible");
  const today = new Date(); today.setUTCHours(0, 0, 0, 0);
  const soon = active.filter((o) => o.deadline?.date && new Date(o.deadline.date + "T00:00:00Z").getTime() >= today.getTime() && new Date(o.deadline.date + "T00:00:00Z").getTime() <= today.getTime() + 14 * DAY)
    .sort((a, b) => a.deadline.date.localeCompare(b.deadline.date));
  const top = [...verified].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, 6);
  const faithCos = C.filter(faithAligned).sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const faithOpps = active.filter(faithAligned);
  const stage = (s: string) => M.filter((m) => m.status === s).length;
  const pipe = [
    { k: "To review", n: stage("awaiting_approval") + stage("draft"), c: "var(--s1)" },
    { k: "Approved", n: stage("approved"), c: "var(--s4)" },
    { k: "Sent", n: stage("sent"), c: "var(--s2)" },
    { k: "Replied", n: stage("replied"), c: "var(--s3)" },
  ];
  const pipeTotal = pipe.reduce((a, b) => a + b.n, 0) || 1;
  const noAddress = M.filter((m) => ["awaiting_approval", "draft"].includes(m.status) && !/@/.test(m.to || "")).length;

  return (<div>
    <h1>Dashboard</h1>
    <p className="sub">Summer 2027, paid, Philadelphia and DC first.</p>

    <div className="kpis">
      <div className="kpi"><span>Open roles you can apply to</span><b>{verified.length}</b><em>{active.length - verified.length} more to check</em></div>
      <div className="kpi"><span>Deadlines in 14 days</span><b>{soon.length}</b><em>{soon[0] ? `next: ${fmt(soon[0].deadline.date)}` : "none"}</em></div>
      <div className="kpi"><span>Emails to review</span><b>{pipe[0].n}</b><em>{noAddress ? `${noAddress} need an address` : "all have addresses"}</em></div>
      <div className="kpi"><span>Faith-aligned firms</span><b>{faithCos.length}</b><em>{faithOpps.length} open {faithOpps.length === 1 ? "role" : "roles"}</em></div>
    </div>

    <div className="grid2">
      <section className="card">
        <div className="head"><b>Deadlines</b><a href="/opportunities">All roles</a></div>
        {soon.length ? soon.map((o) => (
          <div className="line" key={o.id}><span className="date">{fmt(o.deadline.date)}</span><span className="grow"><b>{o.employer}</b><span className="mut small"> {o.title}</span></span>
            <span className={"pill " + (o.elig?.status === "Confirmed eligible" ? "good" : "warn")}>{o.elig?.status === "Confirmed eligible" ? "Eligible" : "Check"}</span></div>
        )) : <p className="mut small">Nothing due in the next two weeks.</p>}
      </section>

      <section className="card">
        <div className="head"><b>Outreach</b><a href="/queue">Review queue</a></div>
        <div className="bar" role="img" aria-label={pipe.map((p) => `${p.k} ${p.n}`).join(", ")}>
          {pipe.filter((p) => p.n).map((p) => <i key={p.k} style={{ width: `${(p.n / pipeTotal) * 100}%`, background: p.c }} />)}
        </div>
        <div className="legend">{pipe.map((p) => <span key={p.k}><i style={{ background: p.c }} />{p.k} <b>{p.n}</b></span>)}</div>
        <p className="mut small" style={{ marginTop: 10 }}>Only emails with a published, verified address can be approved.</p>
      </section>
    </div>

    <section className="card">
      <div className="head"><b>Best roles to apply to</b><span className="mut small">eligibility confirmed on the employer's posting</span></div>
      <div className="tablewrap"><table className="plain"><tbody>
        {top.map((o) => <tr key={o.id}>
          <td className="score">{o.score}</td>
          <td><a href={o.url?.startsWith("http") ? o.url : undefined} target="_blank" rel="noreferrer"><b>{o.employer}</b></a> <span className="small">{o.title}</span>{faithAligned(o) && <span className="pill faith" style={{ marginLeft: 6 }}>Faith-aligned</span>}<div className="mut small">{o.next}</div></td>
          <td className="small nowrap">{o.loc}</td>
          <td className="small">{o.comp?.text}</td>
        </tr>)}
      </tbody></table></div>
    </section>

    <section className="card">
      <div className="head"><b>Faith-aligned investing</b><a href="/companies?faith=1">All faith-aligned firms</a></div>
      <p className="mut small" style={{ marginTop: 0 }}>Firms whose core business is halal investing, Sharia-screened funds or riba-free finance. Screening is activity-based, not a religious ruling.</p>
      <div className="chips">{faithCos.map((c) => <div className="chip" key={c.id}><b>{c.name}</b><span className="small mut">{c.hq || c.metro}</span><span className="small">{c.outreachStatus || "Researching"}</span></div>)}</div>
    </section>
  </div>);
}
