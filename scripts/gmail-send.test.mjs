import { readFile } from 'node:fs/promises';
import { transpileModule, ScriptTarget, ModuleKind } from 'typescript';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
async function moduleFile(path, replacements = {}) {
  let source = await readFile(new URL(path, import.meta.url), 'utf8');
  for (const [a, b] of Object.entries(replacements)) source = source.replace(a, b);
  const js = transpileModule(source, { compilerOptions: { target: ScriptTarget.ES2022, module: ModuleKind.ES2022 } }).outputText;
  return import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
}
const drafts = await readFile(new URL('../lib/gmail-drafts.ts', import.meta.url), 'utf8');
// Inline the real draft helpers into the module under test so no imports need resolving.
const sendSource = (await readFile(new URL('../lib/gmail-send.ts', import.meta.url), 'utf8'))
  .replace('import { gmailApi, rawDraft, type DraftMessage } from "./gmail-drafts";', drafts.replace('import { messageHash } from "./outreach";', '').replace(/export type DraftMessage[^\n]*\n/, 'type DraftMessage = { id: string; hash: string; to: string; subject: string; body: string };\n'))
  .replace('import { messageHash } from "./outreach";', 'const messageHash = (id, o) => o.__hash ?? "reviewed";');
const js = transpileModule(sendSource, { compilerOptions: { target: ScriptTarget.ES2022, module: ModuleKind.ES2022 } }).outputText;
const { approvedMessage, priorMail, sendRawMessage, deleteDraft } = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
const approvedRecord = (patch = {}) => ({ id: 'o1', data: { to: 'pat@example.com', subject: 'Hello', body: 'Hi Pat,\n\nText.', status: 'approved', approval: { hash: 'reviewed', to: 'pat@example.com' }, ...patch } });

test('only an approved message with a matching approval can be sent', () => {
  assert.equal(approvedMessage(approvedRecord(), 'reviewed').to, 'pat@example.com');
  assert.throws(() => approvedMessage(approvedRecord(), 'other'), /changed/);
  assert.throws(() => approvedMessage(approvedRecord({ status: 'awaiting_approval' }), 'reviewed'), /Approve this exact message first/);
  assert.throws(() => approvedMessage(approvedRecord({ approval: null }), 'reviewed'), /Approve this exact message first/);
  assert.throws(() => approvedMessage(approvedRecord({ approval: { hash: 'old', to: 'pat@example.com' } }), 'reviewed'), /after approval/);
  assert.throws(() => approvedMessage(approvedRecord({ approval: { hash: 'reviewed', to: 'someone@else.com' } }), 'reviewed'), /after approval/);
});
test('a message already sent, or with unsupported fields, is refused', () => {
  assert.throws(() => approvedMessage(approvedRecord({ sentAt: '2026-11-19' }), 'reviewed'), /already sent/);
  for (const patch of [{ cc: ['x@y.com'] }, { bcc: ['x@y.com'] }, { attachments: [{}] }, { subject: ' ' }, { body: '' }]) assert.throws(() => approvedMessage(approvedRecord(patch), 'reviewed'));
});
test('duplicate check ignores drafts, reads every page and stops on failure', async () => {
  const urls = [];
  const request = async (url, o) => { urls.push(url); return new Response(JSON.stringify(urls.length === 1 ? { messages: [{ id: 'a' }], nextPageToken: 'n' } : { messages: [{ id: 'b' }] })); };
  assert.deepEqual(await priorMail('t', 'pat@example.com', request), ['a', 'b']);
  assert.match(decodeURIComponent(urls[0]), /-in:drafts/); assert.match(urls[1], /pageToken=n/);
  await assert.rejects(priorMail('t', 'pat@example.com', async () => new Response('{}', { status: 500 })), /Gmail request failed/);
});
test('send posts the exact approved message to messages/send only', async () => {
  let seen;
  const out = await sendRawMessage('tok', { id: 'o1', hash: 'reviewed', to: 'pat@example.com', subject: 'Hello', body: 'Exact ✓ text' }, 'me@example.com', async (url, o) => { seen = { url, o }; return new Response('{"id":"m1","threadId":"t1"}'); });
  assert.deepEqual(out, { id: 'm1', threadId: 't1' });
  assert.equal(seen.url, 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send'); assert.equal(seen.o.method, 'POST');
  const mime = Buffer.from(JSON.parse(seen.o.body).raw, 'base64url').toString();
  assert.match(mime, /To: pat@example.com\r\n/); assert.equal(Buffer.from(mime.split('\r\n\r\n')[1], 'base64').toString(), 'Exact ✓ text');
  assert.doesNotMatch(mime, /\r\n(Bcc|Cc):/i);
  await assert.rejects(sendRawMessage('t', { id: 'o', hash: 'h', to: 'a@b.com', subject: 'x\r\nBcc: v@x.com', body: 'b' }, 'me@example.com', async () => new Response('{}')), /Invalid/);
  await assert.rejects(sendRawMessage('t', { id: 'o', hash: 'h', to: 'a@b.com', subject: 's', body: 'b' }, 'me@example.com', async () => new Response('{}')), /Missing message ID/);
});
test('a saved draft of the same message can be removed after sending', async () => {
  let seen; assert.equal(await deleteDraft('tok', 'd/1', async (url, o) => { seen = { url, o }; return new Response(null, { status: 204 }); }), true);
  assert.equal(seen.o.method, 'DELETE'); assert.match(seen.url, /drafts\/d%2F1$/);
});
test('the send journal allows one initial email per recipient and never re-claims an unclear send', async () => {
  const { SCHEMA } = await moduleFile('../lib/schema.ts'); const db = new PGlite(); await db.exec(SCHEMA);
  const claim = (id, h, to, kind = 'initial') => db.query("insert into gmail_send_exports (outreach_id,message_hash,recipient,kind,state) values ($1,$2,$3,$4,'sending') on conflict do nothing returning outreach_id", [id, h, to, kind]);
  const first = await Promise.all([claim('one', 'h', 'pat@example.com'), claim('one', 'h', 'pat@example.com'), claim('two', 'new', 'pat@example.com')]);
  assert.equal(first.reduce((n, r) => n + r.rows.length, 0), 1);
  await db.query("update gmail_send_exports set state='uncertain'"); assert.equal((await claim('one', 'h', 'pat@example.com')).rows.length, 0);
  assert.equal((await claim('f1', 'fh', 'pat@example.com', 'follow-up')).rows.length, 1, 'a follow-up to the same person is allowed');
  await db.close();
});
const client = await moduleFile('../lib/send-client.ts');
test('client helpers stop on connection, limit and unclear results and approve only the shown version', async () => {
  let body; const ok = async (url, o) => { body = JSON.parse(o.body); return new Response(JSON.stringify({ ok: true })); };
  assert.deepEqual(await client.approveOne({ id: 'o1', hash: 'h1', version: 3 }, ok), { id: 'o1', status: 'approved' }); assert.deepEqual(body, { hash: 'h1', ifVersion: 3 });
  const refused = await client.approveOne({ id: 'o1', hash: 'h', version: 1 }, async () => new Response(JSON.stringify({ error: 'changed' }), { status: 409 })); assert.equal(refused.status, 'failed');
  for (const status of [401, 429, 502]) assert.equal((await client.sendOne({ id: 'o', hash: 'h' }, async () => new Response('{"error":"x"}', { status }))).stop, true);
  assert.equal((await client.sendOne({ id: 'o', hash: 'h' }, async () => new Response('{"status":"uncertain","reason":"check"}'))).stop, true);
  assert.equal((await client.sendOne({ id: 'o', hash: 'h' }, async () => new Response('{"status":"skipped","reason":"r"}'))).stop, false);
  assert.equal((await client.sendOne({ id: 'o', hash: 'h' }, async () => { throw new Error('net'); })).status, 'uncertain');
  const item = (status, ok = true) => ({ data: { status }, checks: [{ id: 'x', label: 'x', ok, hard: true }] });
  assert.equal(client.canApprove(item('awaiting_approval')), true); assert.equal(client.canApprove(item('awaiting_approval', false)), false); assert.equal(client.canSend(item('approved')), true); assert.equal(client.canSend(item('awaiting_approval')), false);
});
