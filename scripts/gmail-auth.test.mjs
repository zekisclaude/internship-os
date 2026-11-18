import { readFile } from 'node:fs/promises';
import { transpileModule, ScriptTarget, ModuleKind } from 'typescript';
import { randomBytes } from 'node:crypto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
function moduleUrl(source) {
 const js=transpileModule(source,{compilerOptions:{target:ScriptTarget.ES2022,module:ModuleKind.ES2022}}).outputText;
 return 'data:text/javascript;base64,'+Buffer.from(js).toString('base64');
}
process.env.SESSION_SECRET=randomBytes(32).toString('hex');
process.env.ENCRYPTION_KEY=randomBytes(32).toString('hex');
process.env.SENDER_GMAIL='owner@example.com';
const cryptoUrl=moduleUrl(await readFile(new URL('../lib/crypto.ts',import.meta.url),'utf8'));
let source=await readFile(new URL('../lib/gmail-auth.ts',import.meta.url),'utf8');
source=source.replace('import { cookies } from "next/headers";','let cookieValue; export function testCookie(value) { cookieValue=value; } const cookies=async()=>({get:()=>cookieValue ? {value:cookieValue}:undefined});');
source=source.replace('from "./crypto"',`from ${JSON.stringify(cryptoUrl)}`);
source=source.replace('import { query } from "./db";',`export const stored=new Map(); const query=async(sql,params)=>{
 if(sql.startsWith("insert")) {stored.set(params[0],params[1]);return [];}
 if(sql.startsWith("select"))return stored.has(params[0])?[{value:stored.get(params[0])}]:[];
 throw new Error("Unexpected database call");
};`);
const auth=await import(moduleUrl(source));
test('Gmail session requires valid signature and expiry',()=>{
 assert.equal(auth.verify(undefined),null);assert.equal(auth.verify('forged'),null);
 assert.equal(auth.verify(auth.sign({exp:Date.now()-1})),null);
 const valid=auth.sign({exp:Date.now()+10000,session:'test'});assert.equal(auth.verify(valid).session,'test');
 assert.equal(auth.verify(valid+'extra'),null);
});
test('OAuth credentials are encrypted and only issued browser capability can access them',async()=>{
 auth.testCookie(undefined);assert.equal(await auth.gmailConnection(),null);
 const session=await auth.saveConnection('dummy-refresh-token');
 assert.ok(!auth.stored.get('gmail_oauth_owner').includes('dummy-refresh-token'));
 auth.testCookie(session);assert.equal((await auth.gmailConnection()).email,'owner@example.com');
 auth.testCookie(auth.sign({session:'someone-else',exp:Date.now()+10000}));assert.equal(await auth.gmailConnection(),null);
});
test('reconnecting or changing configured sender invalidates old browser capabilities',async()=>{
 const old=await auth.saveConnection('dummy-one');await auth.saveConnection('dummy-two');
 auth.testCookie(old);assert.equal(await auth.gmailConnection(),null);
 const current=await auth.saveConnection('dummy-three');auth.testCookie(current);
 process.env.SENDER_GMAIL='another@example.com';assert.equal(await auth.gmailConnection(),null);
 process.env.SENDER_GMAIL='owner@example.com';assert.ok(await auth.gmailConnection());
});
