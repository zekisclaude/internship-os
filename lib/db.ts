// Database access. Production: Neon Postgres via DATABASE_URL. Local/tests: in-memory PGlite.
import { SCHEMA } from "./schema";

type Row = Record<string, any>;
type QueryFn = (sql: string, params?: unknown[]) => Promise<Row[]>;

let ready: Promise<QueryFn> | null = null;

async function init(): Promise<QueryFn> {
  let q: QueryFn;
  if (process.env.DATABASE_URL) {
    const { neon } = await import("@neondatabase/serverless");
    const sql = neon(process.env.DATABASE_URL);
    q = async (text, params = []) => (await (sql as any)(text, params)) as Row[];
  } else {
    if (process.env.VERCEL) throw new Error("DATABASE_URL is not set. Connect a Postgres database (Vercel > Storage > Neon).");
    const { PGlite } = await import("@electric-sql/pglite");
    const g = globalThis as any;
    g.__pglite ??= new PGlite();
    const db = g.__pglite;
    q = async (text, params = []) => (await db.query(text, params)).rows as Row[];
  }
  for (const stmt of SCHEMA.split(";").map((s) => s.trim()).filter(Boolean)) await q(stmt);
  return q;
}

export async function query(sql: string, params: unknown[] = []): Promise<Row[]> {
  ready ??= init();
  const q = await ready;
  return q(sql, params);
}
