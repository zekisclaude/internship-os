import { readFile } from 'node:fs/promises';
import { transpileModule, ScriptTarget, ModuleKind } from 'typescript';
import { test } from 'node:test';
import assert from 'node:assert/strict';
let source = (await readFile(new URL('../lib/outreach.ts', import.meta.url), 'utf8')).replace('import { sha256Hex } from "./crypto";', 'const sha256Hex = (s) => s;');
const js = transpileModule(source, { compilerOptions: { target: ScriptTarget.ES2022, module: ModuleKind.ES2022 } }).outputText;
const { hasVerifiedRecipientRoute } = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
const route = (status, to = 'pat@acme.com', extra = {}) => hasVerifiedRecipientRoute({ to, toStatus: status }, { email: to, emailStatus: status, ...extra });
test('Apollo-verified and GetProspect-valid addresses are accepted', () => { assert.equal(route('apollo_verified'), true); assert.equal(route('getprospect_valid'), true); });
test('other statuses, team inboxes and opted-out contacts stay blocked', () => {
  for (const s of ['getprospect_unknown', 'apollo_unverified', 'pattern-inferred', 'published', 'general_inbox', 'hunter_valid']) assert.equal(route(s), false, s);
  assert.equal(route('getprospect_valid', 'info@acme.com'), false);
  assert.equal(route('getprospect_valid', 'pat@acme.com', { optOut: true }), false);
});
test('a draft and contact with different statuses or addresses are held', () => {
  assert.equal(hasVerifiedRecipientRoute({ to: 'a@acme.com', toStatus: 'getprospect_valid' }, { email: 'a@acme.com', emailStatus: 'apollo_unverified' }), false);
  assert.equal(hasVerifiedRecipientRoute({ to: 'a@acme.com', toStatus: 'getprospect_valid' }, { email: 'b@acme.com', emailStatus: 'getprospect_valid' }), false);
});
