import { actorFor, fail, json } from "@/lib/http";
import { list } from "@/lib/records";
import { COLLECTIONS } from "@/lib/permissions";
export async function GET(req: Request, ctx: { params: Promise<{ collection: string }> }) {
  const a = await actorFor(req);
  if (!a) return fail(401, "unauthorized");
  const { collection } = await ctx.params;
  if (!(COLLECTIONS as readonly string[]).includes(collection)) return fail(404, "unknown collection");
  const since = new URL(req.url).searchParams.get("since") || undefined;
  const rows = await list(collection, since);
  return json({ collection, count: rows.length, records: rows.map((r) => ({ id: r.id, version: r.version, updatedAt: r.updated_at, updatedBy: r.updated_by, data: r.data })) });
}
