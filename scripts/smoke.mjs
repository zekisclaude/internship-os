// Smoke test for the agent API and the approval rules. Run against a local server:
//   BASE=http://localhost:3000 SITE_PASSWORD=... CLAUDE_AGENT_TOKEN=... CHATGPT_AGENT_TOKEN=... node scripts/smoke.mjs
const B = process.env.BASE || "http://localhost:3000";
const C = process.env.CLAUDE_AGENT_TOKEN, G = process.env.CHATGPT_AGENT_TOKEN;
let cookie = "";
let pass = 0, failN = 0;
const ok = (name, cond, extra = "") => { if (cond) pass++; else failN++; console.log(`${cond ? "PASS" : "FAIL"} ${name} ${cond ? "" : extra}`); };
const call = async (method, path, { token, body, owner, origin = B } = {}) => {
  const h = { "content-type": "application/json" };
  if (token) h.authorization = `Bearer ${token}`;
  if (owner) { h.cookie = cookie; if (origin) h.origin = origin; }
  const r = await fetch(B + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined, redirect: "manual" });
  let j = null; try { j = await r.json(); } catch {}
  return { s: r.status, j, loc: r.headers.get("location") };
};

const unlock = async (pw) => fetch(B + "/api/auth/password", { method: "POST", body: new URLSearchParams({ password: pw }), redirect: "manual" });
let u = await unlock("wrong-password");
ok("wrong password is refused", (u.headers.get("location") || "").includes("error=wrong") && !(u.headers.get("set-cookie") || "").includes("ios_session="));
u = await unlock(process.env.SITE_PASSWORD);
cookie = (u.headers.get("set-cookie") || "").split(";")[0];
ok("right password unlocks", cookie.startsWith("ios_session=") && cookie.length > 40);
ok("no token is refused", (await call("GET", "/api/agent/whoami")).s === 401);
ok("bad token is refused", (await call("GET", "/api/agent/whoami", { token: "x".repeat(40) })).s === 401);
ok("claude token works", (await call("GET", "/api/agent/whoami", { token: C })).j?.actor?.name === "claude");
ok("pages need sign-in", [302, 307, 308].includes((await call("GET", "/")).s));

let r = await call("POST", "/api/agent/batch", { token: C, body: { runId: "smoke", items: [
  { collection: "opportunities", id: "smoke-opp", patch: { employer: "Acme", title: "Analyst Intern", status: "Discovered", score: 50 } },
  { collection: "companies", id: "acme", patch: { name: "Acme" } } ] } });
ok("claude creates research records", r.j?.applied === 2, JSON.stringify(r.j));
r = await call("PATCH", "/api/agent/records/contacts/c1", { token: C, body: { patch: { name: "X" } } });
ok("claude cannot write contacts", r.s === 403);

r = await call("POST", "/api/agent/batch", { token: G, body: { items: [
  { collection: "contacts", id: "c1", patch: { name: "Pat Lee", company: "Acme", companyId: "acme", email: "pat@acme.com", emailStatus: "published" } },
  { collection: "outreach", id: "o1", patch: { contactId: "c1", companyId: "acme", company: "Acme", toName: "Pat Lee", to: "pat@acme.com", toStatus: "published", tier: "A", subject: "Wharton first-year, question on Acme", body: "Hi Pat,\n\nTest body.\n\nThanks,\nZeki", status: "awaiting_approval", evidence: [{ claim: "team page", url: "https://acme.com/team" }] } },
  { collection: "outreach", id: "o2", patch: { contactId: "c1", to: "pat@acme.com", toStatus: "published", subject: "s", body: "b", status: "approved" } } ] } });
ok("chatgpt creates contact and draft", r.j?.results?.[0]?.ok && r.j?.results?.[1]?.ok, JSON.stringify(r.j));
ok("chatgpt cannot set approved", r.j?.results?.[2]?.ok === false);
r = await call("PATCH", "/api/agent/records/outreach/o1", { token: G, body: { patch: { approval: { hash: "x" } }, ifVersion: 1 } });
ok("chatgpt cannot write approval", r.s === 403);
r = await call("PATCH", "/api/agent/records/opportunities/smoke-opp", { token: G, body: { patch: { score: 99 }, ifVersion: 1 } });
ok("chatgpt cannot write opportunities", r.s === 403);
r = await call("PATCH", "/api/agent/records/outreach/o1", { token: C, body: { patch: { subject: "changed" }, ifVersion: 1 } });
ok("claude cannot edit a message", r.s === 403);
r = await call("PATCH", "/api/agent/records/outreach/o1", { token: C, body: { patch: { reviewFlags: [{ by: "claude", reason: "posting closed", resolved: false }] }, ifVersion: 1 } });
ok("claude can flag a draft", r.s === 200, JSON.stringify(r.j));
r = await call("PATCH", "/api/agent/records/outreach/o1", { token: C, body: { patch: { reviewFlags: [] }, ifVersion: 1 } });
ok("stale version gets 409", r.s === 409);

let q = await call("GET", "/api/queue", { owner: true });
let it = q.j?.items?.find((x) => x.id === "o1");
ok("owner sees the queue", !!it, JSON.stringify(q.j).slice(0, 200));
ok("agent token cannot use owner routes", (await call("POST", "/api/outreach/o1/approve", { token: C, body: { hash: it.hash } })).s === 401);
ok("owner route refuses a foreign origin", (await call("POST", "/api/outreach/o1/approve", { owner: true, origin: "https://evil.example", body: { hash: it.hash } })).s === 401);
ok("approve with a stale hash is refused", (await call("POST", "/api/outreach/o1/approve", { owner: true, body: { hash: "old" } })).s === 409);
r = await call("POST", "/api/outreach/o1/approve", { owner: true, body: { hash: it.hash } });
ok("owner approves the exact message", r.s === 200 && r.j?.ok, JSON.stringify(r.j));
q = await call("GET", "/api/queue", { owner: true }); it = q.j.items.find((x) => x.id === "o1");
ok("status is approved", it.data.status === "approved" && it.data.approval?.hash === it.hash);
r = await call("PATCH", "/api/agent/records/outreach/o1", { token: G, body: { patch: { body: "Hi Pat,\n\nNew text.\n\nThanks,\nZeki" }, ifVersion: it.version } });
q = await call("GET", "/api/queue", { owner: true }); it = q.j.items.find((x) => x.id === "o1");
ok("an edit after approval clears it", r.s === 200 && it.data.approval === null && it.data.status === "awaiting_approval" && it.data.version === 2, JSON.stringify(it.data));
ok("send without approval is refused", (await call("POST", "/api/outreach/o1/send", { owner: true, body: { hash: it.hash } })).s === 409);
await call("POST", "/api/outreach/o1/approve", { owner: true, body: { hash: it.hash } });
q = await call("GET", "/api/queue", { owner: true }); it = q.j.items.find((x) => x.id === "o1");
r = await call("POST", "/api/outreach/o1/send", { owner: true, body: { hash: it.hash } });
ok("send fails safely when Gmail is not connected", r.s === 502 && /Gmail is not connected/.test(r.j?.error || ""), JSON.stringify(r.j));
q = await call("GET", "/api/queue", { owner: true }); it = q.j.items.find((x) => x.id === "o1");
ok("failed send leaves it approved and unsent", it.data.status === "approved" && !it.data.sentAt && !it.data.sending);

await call("PATCH", "/api/agent/records/contacts/c1", { token: G, body: { patch: { optOut: true }, ifVersion: 1 } });
await call("POST", "/api/agent/batch", { token: G, body: { items: [{ collection: "outreach", id: "o3", patch: { contactId: "c1", to: "pat@acme.com", toStatus: "published", subject: "Follow up on Acme", body: "Hi Pat,\n\nx\n\nThanks,\nZeki", status: "awaiting_approval" } }] } });
q = await call("GET", "/api/queue", { owner: true }); it = q.j.items.find((x) => x.id === "o3");
ok("opt-out blocks approval", (await call("POST", "/api/outreach/o3/approve", { owner: true, body: { hash: it.hash } })).s === 422);
await call("POST", "/api/agent/batch", { token: G, body: { items: [{ collection: "outreach", id: "o4", patch: { to: "first.last@bigbank.com", toStatus: "pattern-inferred", subject: "Wharton first-year, quick question", body: "Hi A,\n\nx\n\nThanks,\nZeki", status: "awaiting_approval" } }] } });
q = await call("GET", "/api/queue", { owner: true }); it = q.j.items.find((x) => x.id === "o4");
ok("guessed address needs the extra tick", (await call("POST", "/api/outreach/o4/approve", { owner: true, body: { hash: it.hash } })).s === 422);
ok("guessed address approves with the tick", (await call("POST", "/api/outreach/o4/approve", { owner: true, body: { hash: it.hash, allowInferred: true } })).s === 200);
ok("cron needs its secret", (await call("GET", "/api/cron/replies")).s === 401);
ok("openapi is served", (await call("GET", "/api/openapi")).j?.openapi === "3.1.0");

r = await call("POST", "/api/admin/import", { token: C, body: { records: [] } });
ok("agents cannot use import", r.s === 401);
r = await call("POST", "/api/admin/import", { owner: true, body: { source: "test", records: [
  { collection: "outreach", id: "old1", data: { to: "a@b.com", toStatus: "published", subject: "Old", body: "Hi", status: "approved", approval: { hash: "h", to: "a@b.com" } } },
  { collection: "opportunities", id: "smoke-opp", data: { employer: "SHOULD NOT OVERWRITE", reqId: "R1" } } ] } });
ok("owner import works", r.s === 200 && r.j?.created === 1 && r.j?.merged === 1, JSON.stringify(r.j));
q = await call("GET", "/api/queue", { owner: true }); it = q.j.items.find((x) => x.id === "old1");
ok("imported approval is history only", it.data.status === "awaiting_approval" && !it.data.approval && it.data.importedHistory?.approval?.hash === "h");
r = await call("GET", "/api/agent/records/opportunities/smoke-opp", { token: C });
ok("import fills gaps without overwriting", r.j?.data?.employer === "Acme" && r.j?.data?.reqId === "R1");
console.log(`\n${pass} passed, ${failN} failed`);
process.exit(failN ? 1 : 0);
