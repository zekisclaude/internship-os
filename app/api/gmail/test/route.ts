import { fail, json, ownerOnly } from "@/lib/http";
import { verify } from "@/lib/gmail";
// Owner-only: checks the Gmail app password works for sending and reading. Sends nothing.
export async function POST(req: Request) {
  if (!(await ownerOnly(req))) return fail(401, "unlock the site first");
  try { return json({ ok: true, result: await verify() }); } catch (e: any) { return json({ ok: false, error: String(e.message || e) }, 502); }
}
