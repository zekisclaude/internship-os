import { readFile } from 'node:fs/promises';
import { transpileModule, ScriptTarget, ModuleKind } from 'typescript';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
async function moduleFile(path, replacements={}) {
 let source=await readFile(new URL(path,import.meta.url),'utf8');
 for(const [a,b] of Object.entries(replacements))source=source.replace(a,b);
 const js=transpileModule(source,{compilerOptions:{target:ScriptTarget.ES2022,module:ModuleKind.ES2022}}).outputText;
 return import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
}
const {rawDraft,existingCorrespondence,gmailApi,selectedMessage}=await moduleFile('../lib/gmail-drafts.ts',{'import { messageHash } from "./outreach";':'const messageHash = () => "reviewed";'});
const record={id:'sample',data:{to:'test@example.com',subject:'A question',body:'Hello,\nTest body ✓',status:'awaiting_approval'}};
test('MIME stores one unsent plain-text message with exact Unicode body',()=>{
 const raw=rawDraft({id:'sample',hash:'reviewed',...record.data},'sender@example.com');
 const mime=Buffer.from(raw,'base64url').toString();
 assert.match(mime,/To: test@example.com\r\n/);assert.match(mime,/Message-ID: <reviewed@internship-os.invalid>/);
 assert.equal(Buffer.from(mime.split('\r\n\r\n')[1],'base64').toString(),record.data.body);
 assert.match(mime,/Subject: =\?UTF-8\?B\?QSBxdWVzdGlvbg==\?=/);
});
test('header injection is refused',()=>assert.throws(()=>rawDraft({id:'s',hash:'h',...record.data,subject:'Hi\r\nBcc: victim@example.com'},'sender@example.com'),/Invalid/));
test('selection rejects stale messages, sent history and unsupported recipients/attachments',()=>{
 assert.throws(()=>selectedMessage(record,'changed'),/changed/);
 for(const patch of [{status:'sent'},{cc:['other@example.com']},{bcc:['other@example.com']},{attachments:[{}]}])assert.throws(()=>selectedMessage({...record,data:{...record.data,...patch}},'reviewed'));
 const result=selectedMessage(record,'reviewed');assert.equal(result.body,record.data.body);assert.equal(record.data.status,'awaiting_approval');
});
test('mailbox duplicate checks retrieve all pages and never create drafts',async()=>{
 const paths=[];const request=async(url,opts)=>{paths.push(url);assert.equal(opts.method,'GET');return new Response(JSON.stringify(paths.length===1?{messages:[{id:'one'}],nextPageToken:'more'}:{messages:[{id:'two'}]}));};
 assert.deepEqual(await existingCorrespondence('private','test@example.com',request),['one','two']);assert.match(paths[1],/pageToken=more/);
});
test('failed mailbox searches cannot be treated as an empty mailbox',async()=>{
 await assert.rejects(existingCorrespondence('private','test@example.com',async()=>new Response('{}',{status:403})),/Gmail request failed/);
});
test('Gmail draft API payload uses drafts endpoint only',async()=>{
 let seen;await gmailApi('private','drafts',{message:{raw:'encoded'}},async(url,opts)=>{seen={url,opts};return new Response('{"id":"draft-id"}');});
 assert.equal(seen.url,'https://gmail.googleapis.com/gmail/v1/users/me/drafts');assert.equal(seen.opts.method,'POST');assert.deepEqual(JSON.parse(seen.opts.body),{message:{raw:'encoded'}});
});
test('database claims prevent simultaneous or changed-version duplicate exports',async()=>{
 const {SCHEMA}=await moduleFile('../lib/schema.ts');const db=new PGlite();await db.exec(SCHEMA);
 const claim=(id,h,email)=>db.query("insert into gmail_draft_exports (outreach_id,message_hash,recipient,state) values ($1,$2,$3,'creating') on conflict do nothing returning outreach_id",[id,h,email]);
 const results=await Promise.all([claim('one','h','test@example.com'),claim('one','h','test@example.com'),claim('two','new','test@example.com')]);
 assert.equal(results.reduce((n,r)=>n+r.rows.length,0),1);
 const row=(await db.query('select * from gmail_draft_exports')).rows[0];assert.equal(row.state,'creating');
 // An uncertain external response leaves the claim in place; retry cannot create.
 await db.query("update gmail_draft_exports set state='uncertain'");assert.equal((await claim('one','h','test@example.com')).rows.length,0);await db.close();
});
