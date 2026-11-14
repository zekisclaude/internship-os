import { actorFor, fail, json } from "@/lib/http";
import { get, write } from "@/lib/records";
export async function GET(req: Request, ctx: { params: Promise<{ collection: string; id: string }> }) {
  const a = await actorFor(req);
  if (!a) return fail(401, "unauthorized");
  const { collection, id } = await ctx.params;
  const r = await get(collection, id);
  if (!r) return fail(404, "not found");
  return json({ id: r.id, version: r.version, updatedAt: r.updated_at, updatedBy: r.updated_by, data: r.data });
}
export async function PATCH(req: Request, ctx: { params: Promise<{ collection: string; id: string }> }) {
  const a = await actorFor(req);
  if (!a) return fail(401, "unauthorized");
  const { collection, id } = await ctx.params;
  const body = await req.json().catch(() => null);
  if (!body?.patch) return fail(400, "body must be {patch, ifVersion}");
  const r = await write(a, { collection, id, patch: body.patch, ifVersion: body.ifVersion });
  return json(r, r.ok ? 200 : r.error?.startsWith("version") ? 409 : 403);
}
