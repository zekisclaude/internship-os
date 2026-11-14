import { NextResponse } from "next/server";
import { sessionCookie } from "@/lib/session";
export async function POST() {
  const res = NextResponse.redirect(`${process.env.APP_URL}/login`, 303);
  res.cookies.delete(sessionCookie.name);
  return res;
}
