import { actorFor, fail, json } from "@/lib/http";
import { write, audit, type WriteItem } from "@/lib/records";
// Body: {runId?, dryRun?, items:[{collection,id,patch,ifVersion?,op?}]}. Up to 200 items, applied in order.
export async function POST(req: Request) {
  const a = await actorFor(req);
  if (!a) return fail(401, "unauthorized");
  const body = await req.json().catch(() => null);
  const items: WriteItem[] = body?.items;
  if (!Array.isArray(items) || !items.length || items.length > 200) return fail(400, "items must be an array of 1 to 200 writes");
  const results = [];
  for (const it of items) results.push(await write(a, it, { dryRun: !!body.dryRun }));
  const ok = results.filter((r) => r.ok).length;
  if (!body.dryRun) await audit(a, "batch", body.runId || "batch", `${ok} of ${items.length} applied`);
  return json({ dryRun: !!body.dryRun, applied: ok, failed: items.length - ok, results });
}
