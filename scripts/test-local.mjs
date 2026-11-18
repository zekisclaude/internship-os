import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createServer } from "node:net";
import { once } from "node:events";
const cwd=process.cwd();
const socket=createServer(); socket.listen(0,"127.0.0.1"); await once(socket,"listening");
const port=socket.address().port; await new Promise(r=>socket.close(r));
const env={...process.env, DATABASE_URL:"", VERCEL:"", SITE_PASSWORD:randomBytes(24).toString("hex"), SESSION_SECRET:randomBytes(32).toString("hex"), ENCRYPTION_KEY:randomBytes(32).toString("hex"), CLAUDE_AGENT_TOKEN:randomBytes(32).toString("hex"), CHATGPT_AGENT_TOKEN:randomBytes(32).toString("hex"), APP_URL:`http://127.0.0.1:${port}`, BASE:`http://127.0.0.1:${port}`, NEXT_TELEMETRY_DISABLED:"1"};
const server=spawn(process.execPath,["node_modules/next/dist/bin/next","start","--hostname","127.0.0.1","--port",String(port)],{cwd,env,stdio:["ignore","pipe","pipe"]});
let logs=""; for(const s of [server.stdout,server.stderr])s.on("data",d=>logs+=d);
let exit=1;
try {
 let ready=false;for(let i=0;i<150;i++){try{await fetch(env.BASE+"/login");ready=true;break;}catch{}await new Promise(r=>setTimeout(r,200));}
 if(!ready)throw new Error("Local test server failed to start");
 const test=spawn(process.execPath,["scripts/smoke.mjs"],{cwd,env,stdio:"inherit"});
 [exit]=await once(test,"exit");
} catch(e){console.error(e.message);console.error(logs.slice(-2000));}
finally {server.kill("SIGTERM");await once(server,"exit");}
if (exit) process.exit(exit);
// Public access remains supported by the owner's explicit choice. These reads
// use a fresh empty test database, never a live deployment.
const publicEnv={...env,SITE_PASSWORD:""};
const publicServer=spawn(process.execPath,["node_modules/next/dist/bin/next","start","--hostname","127.0.0.1","--port",String(port)],{cwd,env:publicEnv,stdio:"ignore"});
try {
 let ready=false;for(let i=0;i<150;i++){try{await fetch(env.BASE+"/login");ready=true;break;}catch{}await new Promise(r=>setTimeout(r,200));}
 if(!ready)throw new Error("Public-mode test server failed to start");
 for(const path of ["/","/queue","/outreach","/api/queue"]){
  const r=await fetch(env.BASE+path,{redirect:"manual"});
  if(r.status!==200)throw new Error(`Public mode ${path} returned ${r.status}`);
  console.log(`PASS public mode ${path}`);
 }
 const denied=await fetch(env.BASE+"/api/agent/batch",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({items:[]})});
 if(denied.status!==401)throw new Error("Anonymous agent write was not refused");
 console.log("PASS public mode still requires agent credentials for agent writes");
} catch(e){console.error(e.message);exit=1;}
finally{publicServer.kill("SIGTERM");await once(publicServer,"exit");}
process.exit(exit || 0);
