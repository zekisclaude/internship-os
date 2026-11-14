"use client";
import { useState } from "react";
export default function Importer() {
  const [text, setText] = useState("");
  const [source, setSource] = useState("");
  const [out, setOut] = useState("");
  async function run(dryRun: boolean) {
    setOut("Working...");
    try {
      const body = { ...JSON.parse(text), dryRun, source: source || "import" };
      const r = await fetch("/api/admin/import", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      setOut(JSON.stringify(await r.json(), null, 2));
    } catch (e: any) { setOut("Not valid JSON: " + e.message); }
  }
  return (<div className="card">
    <b>Import records</b>
    <p className="small mut">Paste an export from the old Claude page or ChatGPT Site. Existing records are only filled in, never overwritten. Old approvals are kept as history and do not count here. Preview first.</p>
    <input type="text" placeholder="Source name, e.g. chatgpt-site-2026-11-14" value={source} onChange={(e) => setSource(e.target.value)} />
    <div style={{ height: 6 }} />
    <textarea placeholder='{"records":[{"collection":"opportunities","id":"...","data":{...}}]}' value={text} onChange={(e) => setText(e.target.value)} />
    <div className="row" style={{ marginTop: 8 }}><button className="btn" onClick={() => run(true)}>Preview</button><button className="btn pri" onClick={() => run(false)}>Import</button></div>
    {out && <pre className="body small">{out}</pre>}
  </div>);
}
