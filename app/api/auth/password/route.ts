import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { safeEqual, sha256Hex } from "@/lib/crypto";
import { makeSession, sessionCookie } from "@/lib/session";
import { audit } from "@/lib/records";

// Password unlock with a lockout: 5 wrong tries in 15 minutes blocks further tries for 15 minutes.
export async function POST(req: Request) {
  const app = process.env.APP_URL!;
  const form = await req.formData().catch(() => null);
  const pw = String(form?.get("password") || "");
  const want = process.env.SITE_PASSWORD || "";
  if (!want) return NextResponse.redirect(`${app}/login?error=setup`, 303);
  const r = await query("select value from secrets where key='login_failures'");
  const fails: number[] = r.length ? JSON.parse(r[0].value).filter((t: number) => t > Date.now() - 15 * 60e3) : [];
  if (fails.length >= 5) return NextResponse.redirect(`${app}/login?error=locked`, 303);
  if (!safeEqual(sha256Hex(pw), sha256Hex(want))) {
    fails.push(Date.now());
    await query("insert into secrets (key,value) values ('login_failures',$1) on conflict (key) do update set value=excluded.value, updated_at=now()", [JSON.stringify(fails)]);
    await audit("anonymous", "unlock_failed", "auth", `${fails.length} recent failures`);
    await new Promise((res) => setTimeout(res, 800));
    return NextResponse.redirect(`${app}/login?error=wrong`, 303);
  }
  await query("delete from secrets where key='login_failures'");
  await audit("owner", "unlock", "auth", "");
  const res = NextResponse.redirect(`${app}/`, 303);
  res.cookies.set(sessionCookie.name, makeSession(), { httpOnly: true, secure: app.startsWith("https"), sameSite: "lax", path: "/", maxAge: sessionCookie.maxAge });
  return res;
}
