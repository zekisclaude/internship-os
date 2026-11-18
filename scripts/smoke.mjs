// Smoke test for the agent API and the approval rules. Run against a local server:
//   BASE=http://localhost:3000 SITE_PASSWORD=... CLAUDE_AGENT_TOKEN=... CHATGPT_AGENT_TOKEN=... node scripts/smoke.mjs
import { createHash } from "node:crypto";

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

// Read a held record through the agent API for negative action tests. The active
// queue intentionally omits it, but direct approval must still be refused.
const rawItem = async (id) => {
  const r = await call("GET", `/api/agent/records/outreach/${id}`, { token: G });
  const data = r.j.data;
  return { ...r.j, hash: createHash("sha256").update(JSON.stringify([id, data.to || "", data.subject || "", data.body || ""])).digest("hex") };
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
ok("unresolved research flag blocks approval", r.s === 422);
await call("PATCH", "/api/agent/records/outreach/o1", { token: C, body: { patch: { reviewFlags: [] }, ifVersion: it.version } });
q = await call("GET", "/api/queue", { owner: true }); it = q.j.items.find((x) => x.id === "o1");
r = await call("POST", "/api/outreach/o1/approve", { owner: true, body: { hash: it.hash } });
ok("owner approves the exact message", r.s === 200 && r.j?.ok, JSON.stringify(r.j));
q = await call("GET", "/api/queue", { owner: true }); it = q.j.items.find((x) => x.id === "o1");
ok("status is approved", it.data.status === "approved" && it.data.approval?.hash === it.hash);
r = await call("PATCH", "/api/agent/records/outreach/o1", { token: G, body: { patch: { body: "Hi Pat,\n\nNew text.\n\nThanks,\nZeki" }, ifVersion: it.version } });
q = await call("GET", "/api/queue", { owner: true }); it = q.j.items.find((x) => x.id === "o1");
ok("an edit after approval clears it", r.s === 200 && it.data.approval === null && it.data.status === "awaiting_approval" && it.data.version === 2, JSON.stringify(it.data));
ok("open in Gmail without approval is refused", (await call("POST", "/api/outreach/o1/compose", { owner: true, body: { hash: it.hash } })).s === 409);
await call("POST", "/api/outreach/o1/approve", { owner: true, body: { hash: it.hash } });
q = await call("GET", "/api/queue", { owner: true }); it = q.j.items.find((x) => x.id === "o1");
r = await call("POST", "/api/outreach/o1/compose", { owner: true, body: { hash: it.hash } });
ok("open in Gmail returns a filled compose link", r.s === 200 && r.j?.url?.startsWith("https://mail.google.com/mail/?view=cm") && r.j.url.includes("to=pat%40acme.com"), JSON.stringify(r.j));
await call("PATCH", "/api/agent/records/contacts/c1", { token: G, body: { patch: { email: "changed@acme.com" }, ifVersion: 1 } });
ok("recipient change after approval blocks compose", (await call("POST", "/api/outreach/o1/compose", { owner: true, body: { hash: it.hash } })).s === 422);
ok("recipient change after approval blocks sent record", (await call("POST", "/api/outreach/o1/sent", { owner: true, body: { hash: it.hash } })).s === 422);
await call("PATCH", "/api/agent/records/contacts/c1", { token: G, body: { patch: { email: "pat@acme.com" }, ifVersion: 2 } });
r = await call("POST", "/api/outreach/o1/sent", { owner: true, body: { hash: it.hash } });
q = await call("GET", "/api/queue", { owner: true }); it = q.j.items.find((x) => x.id === "o1");
ok("I sent it records the send", r.s === 200 && it.data.status === "sent" && !!it.data.sentAt && !!it.data.followUpDue, JSON.stringify(it.data).slice(0,200));
r = await call("PATCH", "/api/agent/records/outreach/o1", { token: G, body: { patch: { status: "replied" }, ifVersion: it.version } });
ok("chatgpt can mark a sent message replied", r.s === 200, JSON.stringify(r.j));
r = await call("PATCH", "/api/agent/records/outreach/o4", { token: G, body: { patch: { status: "replied" }, ifVersion: 1 } });
ok("chatgpt cannot mark an unsent message replied", r.s === 403 || r.s === 409);

// A verified label on a draft cannot override a different linked contact.
await call("PATCH", "/api/agent/records/outreach/mismatch", { token: G, body: { patch: { contactId: "c1", to: "other@acme.com", toStatus: "published", subject: "Mismatch", body: "Test", status: "awaiting_approval" } } });
q = await call("GET", "/api/queue", { owner: true }); it = await rawItem("mismatch");
ok("mismatched contact is held", !q.j.items.some((x) => x.id === "mismatch"));
ok("direct approval cannot bypass held route", (await call("POST", "/api/outreach/mismatch/approve", { owner: true, body: { hash: it.hash } })).s === 422);

await call("PATCH", "/api/agent/records/outreach/duplicate", { token: G, body: { patch: { contactId: "c1", companyId: "acme", to: "pat@acme.com", toStatus: "published", subject: "Another initial", body: "Test", status: "awaiting_approval" } } });
it = await rawItem("duplicate");
ok("prior replied initial blocks duplicate firm outreach", (await call("POST", "/api/outreach/duplicate/approve", { owner: true, body: { hash: it.hash } })).s === 422);

await call("PATCH", "/api/agent/records/contacts/c1", { token: G, body: { patch: { optOut: true }, ifVersion: 3 } });
await call("POST", "/api/agent/batch", { token: G, body: { items: [{ collection: "outreach", id: "o3", patch: { contactId: "c1", to: "pat@acme.com", toStatus: "published", subject: "Follow up on Acme", body: "Hi Pat,\n\nx\n\nThanks,\nZeki", status: "awaiting_approval" } }] } });
q = await call("GET", "/api/queue", { owner: true }); it = await rawItem("o3");
ok("opted-out draft is held, not deleted", !q.j.items.some((x) => x.id === "o3") && q.j.heldCount >= 1 && it.data.subject === "Follow up on Acme");
ok("opt-out blocks approval", (await call("POST", "/api/outreach/o3/approve", { owner: true, body: { hash: it.hash } })).s === 422);
await call("POST", "/api/agent/batch", { token: G, body: { items: [{ collection: "outreach", id: "o4", patch: { to: "first.last@bigbank.com", toStatus: "pattern-inferred", subject: "Wharton first-year, quick question", body: "Hi A,\n\nx\n\nThanks,\nZeki", status: "awaiting_approval" } }] } });
q = await call("GET", "/api/queue", { owner: true }); it = await rawItem("o4");
ok("guessed route stays out of the active queue", !q.j.items.some((x) => x.id === "o4"));
ok("guessed address cannot be approved", (await call("POST", "/api/outreach/o4/approve", { owner: true, body: { hash: it.hash } })).s === 422);
await call("POST", "/api/agent/batch", { token: G, body: { items: [{ collection: "outreach", id: "o5", patch: { to: "info@acme.com", toStatus: "general_inbox", subject: "Wharton first-year, quick question", body: "Hi A,\n\nx\n\nThanks,\nZeki", status: "awaiting_approval" } }] } });
q = await call("GET", "/api/queue", { owner: true }); it = await rawItem("o5");
ok("general inbox cannot be approved", (await call("POST", "/api/outreach/o5/approve", { owner: true, body: { hash: it.hash } })).s === 422);
ok("openapi is served", (await call("GET", "/api/openapi")).j?.openapi === "3.1.0");

r = await call("POST", "/api/admin/import", { token: C, body: { records: [] } });
ok("agents cannot use import", r.s === 401);
r = await call("POST", "/api/admin/import", { owner: true, body: { source: "test", records: [
  { collection: "outreach", id: "old1", data: { to: "a@b.com", toStatus: "published", subject: "Old", body: "Hi", status: "approved", approval: { hash: "h", to: "a@b.com" } } },
  { collection: "opportunities", id: "smoke-opp", data: { employer: "SHOULD NOT OVERWRITE", reqId: "R1" } } ] } });
ok("owner import works", r.s === 200 && r.j?.created === 1 && r.j?.merged === 1, JSON.stringify(r.j));
q = await call("GET", "/api/queue", { owner: true }); it = await rawItem("old1");
ok("imported approval is history only", it.data.status === "awaiting_approval" && !it.data.approval && it.data.importedHistory?.approval?.hash === "h");
r = await call("GET", "/api/agent/records/opportunities/smoke-opp", { token: C });
ok("import fills gaps without overwriting", r.j?.data?.employer === "Acme" && r.j?.data?.reqId === "R1");

r = await call("POST", "/api/admin/import", { owner: true, body: { source: "t", records: [{ collection: "contacts", id: "c1", data: { email: "new@acme.com", emailStatus: "apollo_verified", name: "SHOULD NOT CHANGE" } }] } });
r = await call("GET", "/api/agent/records/contacts/c1", { token: C });
ok("import does not overwrite a contact email by default", r.j?.data?.email === "pat@acme.com" && r.j?.data?.name === "Pat Lee", JSON.stringify(r.j?.data));
await call("POST", "/api/admin/import", { owner: true, body: { source: "t", overwriteContactRoute: true, records: [{ collection: "contacts", id: "c1", data: { email: "new@acme.com", emailStatus: "apollo_verified", name: "SHOULD NOT CHANGE" } }] } });
r = await call("GET", "/api/agent/records/contacts/c1", { token: C });
ok("overwriteContactRoute replaces only route fields", r.j?.data?.email === "new@acme.com" && r.j?.data?.name === "Pat Lee", JSON.stringify(r.j?.data));

await call("POST", "/api/agent/batch", { token: G, body: { items: [
  { collection: "contacts", id: "c2", patch: { name: "Dana Roe", company: "Beta", companyId: "beta", email: "dana@beta.com", emailStatus: "apollo_verified" } },
  { collection: "outreach", id: "o8", patch: { contactId: "c2", companyId: "beta", company: "Beta", toName: "Dana Roe", to: "dana@beta.com", toStatus: "apollo_verified", subject: "Wharton first-year, question on Beta", body: "Hi Dana,\n\nx\n\nThanks,\nZeki", status: "awaiting_approval", evidence: [{ claim: "site", url: "https://beta.com" }] } }] } });
await call("PATCH", "/api/agent/records/outreach/o8", { token: C, body: { patch: { reviewFlags: [{ by: "claude", reason: "citizenship rule", resolved: false }] }, ifVersion: 1 } });
q = await call("GET", "/api/queue", { owner: true }); it = q.j.items.find((x) => x.id === "o8");
ok("an open flag blocks approval", it && it.checks.some((c) => c.id === "flags" && !c.ok));
ok("agents cannot resolve flags", (await call("POST", "/api/outreach/o8/resolveflags", { token: C, body: {} })).s === 401);
r = await call("POST", "/api/outreach/o8/resolveflags", { owner: true, body: { note: "citizenship confirmed", ifVersion: it.version } });
q = await call("GET", "/api/queue", { owner: true }); it = q.j.items.find((x) => x.id === "o8");
ok("owner resolves the flag with a note", r.s === 200 && it.checks.find((c) => c.id === "flags").ok && it.data.reviewFlags[0].resolvedBy && it.data.history.some((h) => h.event === "flags_resolved"), JSON.stringify(r.j));
console.log(`\n${pass} passed, ${failN} failed`);
process.exit(failN ? 1 : 0);
