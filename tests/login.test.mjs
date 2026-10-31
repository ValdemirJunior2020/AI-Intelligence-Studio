import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const folder=fs.mkdtempSync(path.join(os.tmpdir(),'theux-login-'));
process.env.NODE_ENV='test';
process.env.AIHUB_DATA_DIR=folder;
const {app}=await import('../server/index.mjs');
const listener=app.listen(0,'127.0.0.1');await new Promise(resolve=>listener.once('listening',resolve));
const origin='http://127.0.0.1:5174',base='http://127.0.0.1:'+listener.address().port;
test('setup supports local alternate Vite port and email admin',async()=>{
 const res=await fetch(base+'/api/setup',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({username:'qa@example.com',password:'a-safe-example-password-123'})});
 assert.equal(res.status,201);assert.equal(res.headers.get('access-control-allow-origin'),origin);
 const body=await res.json();assert.equal(body.user.username,'qa@example.com');
 const login=await fetch(base+'/api/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({username:'QA@example.com',password:'a-safe-example-password-123'})});
 assert.equal(login.status,200);
});
test('setup blocks non-local origin',async()=>{
 const res=await fetch(base+'/api/setup',{method:'POST',headers:{Origin:'https://example.netlify.app','Content-Type':'application/json'},body:JSON.stringify({username:'other@example.com',password:'a-safe-example-password-123'})});
 assert.notEqual(res.status,201);
 await new Promise(resolve=>listener.close(resolve));fs.rmSync(folder,{recursive:true,force:true});
});
