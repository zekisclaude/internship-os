import { requireUser } from "@/lib/guard";
import { list } from "@/lib/records";
export const dynamic = "force-dynamic";
const OK = new Set(["apollo_verified", "getprospect_valid"]);
// Penn alumni directory people the owner chose to contact. Only people with an address a finder
// reported valid are listed; format-derived directory addresses are never stored or used.
export default async function Page() {
  await requireUser();
  const [contacts, outreach] = await Promise.all([list("contacts"), list("outreach")]);
  const people = contacts.map((r) => ({ id: r.id, ...r.data })).filter((c: any) => c.directory) as any[];
  const byContact = new Map<string, any>();
  for (const o of outreach) if (o.data.contactId) byContact.set(o.data.contactId, { id: o.id, ...o.data });
  const rows = people.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const ready = rows.filter((c) => OK.has(c.emailStatus)).length;
  return (<div>
    <h1>Directory outreach</h1>
    <p className="sub">{rows.length} Penn alumni from the alumni directory, {ready} with a finder-valid address. Drafts appear in the <a href="/queue">review queue</a>; nothing is sent without your approval.</p>
    <div className="tablewrap"><table><thead><tr><th>Name</th><th>Firm and role</th><th>Penn</th><th>Address</th><th>Draft</th></tr></thead><tbody>
      {rows.map((c) => { const o = byContact.get(c.id); return <tr key={c.id}>
        <td><b>{c.name}</b><div className="small mut">{c.track}</div></td>
        <td className="small">{c.company}<div className="mut">{c.title}</div></td>
        <td className="small">{c.penn}</td>
        <td className="small">{c.email || "none"}<div className="mut">{c.emailStatus === "getprospect_valid" ? "Valid per GetProspect" : c.emailStatus === "apollo_verified" ? "Verified by Apollo" : "Not found"}</div></td>
        <td><span className="pill">{o ? String(o.status).replace("_", " ") : "No draft yet"}</span></td></tr>; })}
      {!rows.length && <tr><td colSpan={5} className="mut">No directory contacts yet.</td></tr>}
    </tbody></table></div>
  </div>);
}
