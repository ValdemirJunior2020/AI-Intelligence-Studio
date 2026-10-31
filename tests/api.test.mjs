import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import {PDFDocument} from 'pdf-lib';
const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'theux-api-test-'));
process.env.NODE_ENV='test';
process.env.AIHUB_DATA_DIR=dataDir;
process.env.CORS_ORIGIN='http://localhost:5173,http://127.0.0.1:5173';
delete process.env.MINIMAX_API_KEY;
const {app}=await import('../server/index.mjs');
const server=app.listen(0,'127.0.0.1');
await new Promise(resolve=>server.once('listening',resolve));
const base='http://127.0.0.1:'+server.address().port;
const api=async(url,opts={})=>{
 const r=await fetch(base+url,opts);return {status:r.status,headers:r.headers,data:r.headers.get('content-type')?.includes('application/json')?await r.json():await r.arrayBuffer()};
};
const cleanup=async()=>{await new Promise(resolve=>server.close(resolve));fs.rmSync(dataDir,{recursive:true,force:true})};
test('health is public and authenticated endpoints are protected',async()=>{
 const h=await api('/api/health');assert.equal(h.status,200);assert.equal(h.data.ok,true);
 assert.equal((await api('/api/catalog')).status,401);
});
let token='';
test('first admin creation, sign in, and role protected endpoints',async()=>{
 const setup=await api('/api/setup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'theuxadmin',password:'long-secure-test-password'})});
 assert.equal(setup.status,201);token=setup.data.token;assert.equal(setup.data.user.role,'admin');
 assert.equal((await api('/api/setup',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,409);
 const login=await api('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'theuxadmin',password:'long-secure-test-password'})});
 assert.equal(login.status,200);
 const catalog=await api('/api/catalog',{headers:{Authorization:'Bearer '+token}});
 assert.equal(catalog.status,200);assert.ok(catalog.data.studios.some(t=>t.id==='csv'));
 const user=await api('/api/users',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({username:'member1',password:'long-secure-test-password',role:'admin'})});
 assert.equal(user.status,201);assert.equal(user.data.role,'member');
});
test('CSV analytics computes statistics for a local upload',async()=>{
 const form=new FormData();form.append('file',new Blob(['product,price\nA,5\nB,15\n'],{type:'text/csv'}),'input.csv');
 const r=await api('/api/csv/analyze',{method:'POST',headers:{Authorization:'Bearer '+token},body:form});
 assert.equal(r.status,200);assert.equal(r.data.rows,2);assert.equal(r.data.summary.find(x=>x.column==='price').avg,10);
});
test('PDF creator and merger return valid binary documents',async()=>{
 const headers={Authorization:'Bearer '+token,'Content-Type':'application/json'};
 const a=await api('/api/pdf',{method:'POST',headers,body:JSON.stringify({title:'QA report',body:'This is a report.'})});
 assert.equal(a.status,200);assert.ok(Buffer.from(a.data).toString('ascii',0,4)==='%PDF');
 const doc=await PDFDocument.create();doc.addPage([300,300]);const bytes=await doc.save();
 const form=new FormData();form.append('files',new Blob([bytes],{type:'application/pdf'}),'a.pdf');form.append('files',new Blob([bytes],{type:'application/pdf'}),'b.pdf');
 const m=await api('/api/pdf/merge',{method:'POST',headers:{Authorization:'Bearer '+token},body:form});
 assert.equal(m.status,200);const merged=await PDFDocument.load(m.data);assert.equal(merged.getPageCount(),2);
});
test('MiniMax refuses costly jobs without an API key',async()=>{
 const r=await api('/api/videos',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({prompt:'A train',duration:5,ratio:'16:9',confirmCost:true})});
 assert.equal(r.status,409);
 await cleanup();
});
