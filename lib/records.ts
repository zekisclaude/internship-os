import { query } from "./db";
import type { Actor } from "./agents";
import { actorLabel } from "./agents";
import { checkWrite } from "./permissions";

export type Rec = { collection: string; id: string; data: Record<string, any>; version: number; updated_at: string; updated_by: string };
const ID = /^[A-Za-z0-9_.:@+-]{1,200}$/;

export async function list(collection: string, since?: string): Promise<Rec[]> {
  if (since) return (await query("select * from records where collection=$1 and updated_at > $2 order by id", [collection, since])) as Rec[];
  return (await query("select * from records where collection=$1 order by id", [collection])) as Rec[];
}
export async function get(collection: string, id: string): Promise<Rec | null> {
  const r = await query("select * from records where collection=$1 and id=$2", [collection, id]);
  return (r[0] as Rec) || null;
}
export async function audit(actor: Actor | string, action: string, target: string, detail = "") {
  await query("insert into audit (actor, action, target, detail) values ($1,$2,$3,$4)", [typeof actor === "string" ? actor : actorLabel(actor), action, target, detail.slice(0, 2000)]);
}

export type WriteItem = { collection: string; id: string; patch: Record<string, unknown>; ifVersion?: number; op?: "merge" | "create" };
export type WriteResult = { collection: string; id: string; ok: boolean; version?: number; error?: string };

// Merge patch into a record. Existing records need ifVersion (optimistic concurrency).
export async function write(actor: Actor, item: WriteItem, opts: { dryRun?: boolean; serverFields?: boolean } = {}): Promise<WriteResult> {
  const { collection, id, patch } = item;
  const base = { collection, id };
  if (!ID.test(id)) return { ...base, ok: false, error: "invalid id" };
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return { ...base, ok: false, error: "patch must be an object" };
  const existing = await get(collection, id);
  if (!opts.serverFields) {
    const deny = checkWrite(actor, collection, patch, existing?.data || null);
    if (deny) return { ...base, ok: false, error: deny };
  }
  if (existing && item.op === "create") return { ...base, ok: false, error: "already exists", version: existing.version };
  if (existing && item.ifVersion !== existing.version) return { ...base, ok: false, error: `version mismatch: current ${existing.version}`, version: existing.version };
  let data: Record<string, any> = { ...(existing?.data || {}), ...patch };
  // Editing a message's recipient, subject or body clears any approval and bumps its message version.
  if (collection === "outreach" && existing && ["to", "subject", "body"].some((k) => k in patch && (patch as any)[k] !== existing.data[k])) {
    data = { ...data, approval: null, version: (existing.data.version || 1) + 1, status: existing.data.status === "approved" ? "awaiting_approval" : data.status };
  }
  if (!existing) data = { origin: actorLabel(actor), ...data };
  if (opts.dryRun) return { ...base, ok: true, version: existing ? existing.version + 1 : 1 };
  const who = actorLabel(actor);
  if (existing) {
    const r = await query("update records set data=$1, version=version+1, updated_at=now(), updated_by=$2 where collection=$3 and id=$4 and version=$5 returning version",
      [JSON.stringify(data), who, collection, id, existing.version]);
    if (!r.length) return { ...base, ok: false, error: "version mismatch (concurrent write)" };
    await audit(actor, "update", `${collection}/${id}`, Object.keys(patch).join(", "));
    return { ...base, ok: true, version: r[0].version };
  }
  await query("insert into records (collection,id,data,version,updated_by) values ($1,$2,$3,1,$4)", [collection, id, JSON.stringify(data), who]);
  await audit(actor, "create", `${collection}/${id}`, "");
  return { ...base, ok: true, version: 1 };
}
