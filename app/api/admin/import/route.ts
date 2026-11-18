// Owner-only import of records from the earlier systems (Claude artifact export, ChatGPT Site export, research deltas).
// Accepts {dryRun, records:[{collection,id,data}]} or {collections:{name:[{id,data}]}} or a research delta {records:[{type,id,data}]}.
// Existing records are merged (incoming fields win only where the current record has no value), never replaced.
// Exception: overwriteContactRoute:true lets a contacts import replace email, emailStatus, source and verified only.
// Old approvals and send fields are kept as history under importedHistory and never count as approval here.
import { fail, json, ownerOnly } from "@/lib/http";
import { get, write, audit } from "@/lib/records";
import { COLLECTIONS, SERVER_ONLY_OUTREACH } from "@/lib/permissions";

const PLURAL: Record<string, string> = { opportunity: "opportunities", company: "companies", contact: "contacts", thread: "threads", run: "runs" };

export async function POST(req: Request) {
  const u = await ownerOnly(req);
  if (!u) return fail(401, "owner sign-in required");
  const body = await req.json().catch(() => null);
  if (!body) return fail(400, "invalid JSON");
  let recs: { collection: string; id: string; data: any }[] = [];
  if (Array.isArray(body.records)) recs = body.records.map((r: any) => ({ collection: r.collection || PLURAL[r.type] || r.type, id: r.id, data: r.data }));
  else if (body.collections) for (const [c, arr] of Object.entries<any>(body.collections)) for (const r of arr) recs.push({ collection: c, id: r.id, data: r.data ?? r });
  recs = recs.filter((r) => r && r.id && r.data && (COLLECTIONS as readonly string[]).includes(r.collection));
  if (!recs.length) return fail(400, "no importable records found");
  if (recs.length > 2000) return fail(400, "at most 2000 records per import");
  const actor = { kind: "human" as const, email: u.email };
  const source = String(body.source || "import");
  let created = 0, merged = 0, unchanged = 0; const errors: string[] = [];
  for (const r of recs) {
    let data = { ...r.data };
    if (r.collection === "outreach") {
      const hist: Record<string, unknown> = {};
      for (const f of [...SERVER_ONLY_OUTREACH, "gmailDraftId", "gmailDraftUrl"]) if (f in data) { hist[f] = data[f]; delete data[f]; }
      if (["approved", "gmail_draft"].includes(data.status)) data.status = "awaiting_approval";
      if (Object.values(hist).some((v) => v)) data.importedHistory = { source, ...hist };
      if (hist.sentAt) data.status = data.status === "replied" ? "replied" : "sent";
    }
    const cur = await get(r.collection, r.id);
    let patch = data;
    if (cur) {
      // Fill empty fields only, except: an import may name contact route fields in body.overwriteContactRoute
      // (email, emailStatus, source, verified) to replace a stale address, e.g. a team inbox with an Apollo-verified one.
      const ow = r.collection === "contacts" && body.overwriteContactRoute === true ? ["email", "emailStatus", "source", "verified"] : [];
      patch = Object.fromEntries(Object.entries(data).filter(([k, v]) => ow.includes(k) || cur.data[k] === undefined || cur.data[k] === null || cur.data[k] === ""));
      if (!Object.keys(patch).length) { unchanged++; continue; }
    }
    if (body.dryRun) { cur ? merged++ : created++; continue; }
    const res = await write(actor, { collection: r.collection, id: r.id, patch: { ...patch, ...(cur ? {} : { importedFrom: source }) }, ifVersion: cur?.version }, { serverFields: true });
    if (!res.ok) errors.push(`${r.collection}/${r.id}: ${res.error}`); else cur ? merged++ : created++;
  }
  if (!body.dryRun) await audit(actor, "import", source, `${created} created, ${merged} merged, ${unchanged} unchanged, ${errors.length} errors`);
  return json({ dryRun: !!body.dryRun, created, merged, unchanged, errors });
}
