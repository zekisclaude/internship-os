"use client";
import { useState } from "react";
import SendCenter from "./SendCenter";
import type { SendItem } from "@/lib/send-client";

export default function SendPage({ initial, cap, sent }: { initial: SendItem[]; cap: number; sent: number }) {
  const [items, setItems] = useState(initial);
  const [sentToday, setSent] = useState(sent);
  async function reload() { const r = await fetch("/api/queue", { cache: "no-store" }); if (r.ok) { const j = await r.json(); setItems(j.items); setSent(j.sent); } }
  return <div>
    <h1>Send</h1>
    <p className="sub">Approve in the <a href="/queue">Review queue</a>, then send here. Nothing sends until you confirm the exact list.</p>
    <SendCenter items={items} reload={reload} cap={cap} sentToday={sentToday} showList />
  </div>;
}
