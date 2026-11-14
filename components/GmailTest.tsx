"use client";
import { useState } from "react";
export default function GmailTest() {
  const [m, setM] = useState("");
  return (<div className="row"><button className="btn" onClick={async () => {
    setM("Checking...");
    const r = await fetch("/api/gmail/test", { method: "POST" });
    const j = await r.json().catch(() => ({}));
    setM(j.ok ? "Connection works. Nothing was sent." : `Failed: ${j.error || r.status}`);
  }}>Test Gmail connection</button><span className="small">{m}</span></div>);
}
