import { readFile } from 'node:fs/promises';
import { transpileModule, ScriptTarget, ModuleKind } from 'typescript';
import { test } from 'node:test';
import assert from 'node:assert/strict';
const source = await readFile(new URL('../lib/gmail-flow.ts', import.meta.url), 'utf8');
const js = transpileModule(source, { compilerOptions: { target: ScriptTarget.ES2022, module: ModuleKind.ES2022 } }).outputText;
const { prepareGmail } = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
const item = { id: 'test', version: 1, hash: 'reviewed', data: { status: 'awaiting_approval' } };
const approved = { ...item, data: { status: 'approved' } };
const url = 'https://mail.google.com/mail/?view=cm&to=test%40example.com';
function mock(replies) {
 const calls=[];
 const request=async (path,opts)=>{ calls.push({path,opts}); const r=replies.shift();if(r instanceof Error)throw r;assert.ok(r,'Unexpected request');return new Response(JSON.stringify(r.body),{status:r.status||200});};
 return {request,calls};
}
test('approve then prepare exact reviewed message without popup',async()=>{
 const {request,calls}=mock([{body:{ok:true}},{body:{items:[approved]}},{body:{url}}]);
 assert.equal(await prepareGmail(item,request),url);
 assert.deepEqual(calls.map(c=>c.path),['/api/outreach/test/approve','/api/queue','/api/outreach/test/compose']);
 assert.equal(JSON.parse(calls[2].opts.body).hash,'reviewed');
});
test('existing approval is not repeated',async()=>{
 const {request,calls}=mock([{body:{items:[approved]}},{body:{url}}]);await prepareGmail(approved,request);assert.equal(calls.length,2);
});
test('approval rejection exposes cause and stops before compose',async()=>{
 const {request,calls}=mock([{status:422,body:{error:'blocked',failed:['Recipient opted out']}}]);
 await assert.rejects(prepareGmail(item,request),/blocked: Recipient opted out/);assert.equal(calls.length,1);
});
test('changed message cannot substitute a new hash after clicking approve',async()=>{
 const {request,calls}=mock([{body:{ok:true}},{body:{items:[{...approved,hash:'changed'}]}}]);
 await assert.rejects(prepareGmail(item,request),/message changed/);assert.equal(calls.length,2);
});
test('missing draft is an explicit error',async()=>{
 const {request}=mock([{body:{ok:true}},{body:{items:[]}}]);await assert.rejects(prepareGmail(item,request),/no longer available/);
});
test('network failures propagate to visible UI handling',async()=>{
 const {request}=mock([new Error('Network unavailable')]);await assert.rejects(prepareGmail(item,request),/Network unavailable/);
});
test('untrusted redirect URL is rejected',async()=>{
 const {request}=mock([{body:{items:[approved]}},{body:{url:'https://example.com/'}}]);await assert.rejects(prepareGmail(approved,request),/usable link/);
});
