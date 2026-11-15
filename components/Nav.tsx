"use client";
import { usePathname } from "next/navigation";
const LINKS = [["/", "Dashboard"], ["/queue", "Review queue"], ["/opportunities", "Opportunities"], ["/companies", "Companies"], ["/activity", "Activity"], ["/settings", "Settings"]];
export default function Nav() {
  const p = usePathname();
  return <nav>{LINKS.map(([h, l]) => <a key={h} href={h} className={(h === "/" ? p === "/" : p.startsWith(h)) ? "on" : ""}>{l}</a>)}</nav>;
}
