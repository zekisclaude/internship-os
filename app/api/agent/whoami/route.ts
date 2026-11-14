import { actorFor, fail, json } from "@/lib/http";
import { COLLECTIONS } from "@/lib/permissions";
import { query } from "@/lib/db";
export async function GET(req: Request) {
  const a = await actorFor(req);
  if (!a) return fail(401, "unauthorized");
  const counts = await query("select collection, count(*)::int as n from records group by collection");
  return json({ actor: a, collections: COLLECTIONS, counts: Object.fromEntries(counts.map((r) => [r.collection, r.n])) });
}
