import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import pdfParse from 'pdf-parse';
import {parse as parseCSV} from 'csv-parse/sync';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { clean, safeName, snippets, passwordHash, passwordVerify } from './lib.mjs';
import { studios, groups } from './catalog.mjs';

const app=express();
const home=path.resolve(process.env.AIHUB_DATA_DIR||path.join(path.dirname(fileURLToPath(import.meta.url)),'..','data'));
fs.mkdirSync(home,{recursive:true});
const databasePath=path.join(home,'store.json');
let db={users:[],documents:[],jobs:[],videos:[],createdAt:new Date().toISOString()};
try { db={...db,...JSON.parse(fs.readFileSync(databasePath,'utf8'))}; }catch(e){if(e.code!=='ENOENT')throw e;}
function save(){const temp=databasePath+'.tmp';fs.writeFileSync(temp,JSON.stringify(db,null,2),{mode:0o600});fs.renameSync(temp,databasePath)}
const tokens=new Map();
const attempts=new Map();
const controllers=new Map();
const port=Number(process.env.PORT||4317);
const allowed=(process.env.CORS_ORIGIN||'').split(',').map(x=>x.trim().replace(/\/$/,'')).filter(Boolean);
function isLoopbackOrigin(origin){
 try{const u=new URL(origin);return u.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(u.hostname)&&/^\d+$/.test(u.port)}catch{return false}
}
function isApprovedOrigin(origin){return !origin||isLoopbackOrigin(origin)||allowed.includes(origin.replace(/\/$/,''))}

app.disable('x-powered-by');
app.use(cors({origin(origin,cb){if(isApprovedOrigin(origin))return cb(null,true);cb(new Error('Origin not approved'));},methods:['GET','POST','DELETE'],allowedHeaders:['Content-Type','Authorization']}));
app.use(express.json({limit:'1mb'}));
app.use((req,res,next)=>{res.setHeader('Cache-Control','no-store');next()});
function id(){return crypto.randomUUID()}
function failure(res,code,message){return res.status(code).json({error:message})}
function auth(req,res,next){
 const key=(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
 const session=tokens.get(key);
 if(!key||!session||session.until<Date.now()){if(key)tokens.delete(key);return failure(res,401,'Please sign in again.');}
 const user=db.users.find(x=>x.id===session.user);
 if(!user){tokens.delete(key);return failure(res,401,'Account no longer exists.');}
 req.user=user;next();
}
function admin(req,res,next){if(req.user.role!=='admin')return failure(res,403,'Admin only');next()}
function rate(ip){const k=String(ip||'unknown');const x=attempts.get(k)||{count:0,until:0};if(Date.now()>x.until){x.count=0;x.until=Date.now()+600000;}x.count++;attempts.set(k,x);return x.count<=8}
function tokenFor(user){const t=crypto.randomBytes(32).toString('hex');tokens.set(t,{user:user.id,until:Date.now()+12*3600000});return t}
async function ollama(route,body,signal){
 const base=(process.env.OLLAMA_URL||'http://127.0.0.1:11434').replace(/\/+$/,'');
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),180000);
 const abort=()=>controller.abort();
 if(signal)signal.addEventListener('abort',abort,{once:true});
 try{
  const r=await fetch(base+route,{method:body?'POST':'GET',headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:controller.signal});
  const json=await r.json();
  if(!r.ok)throw new Error(json.error||'Ollama request failed');
  return json;
 }finally{clearTimeout(timer);if(signal)signal.removeEventListener('abort',abort);}
}
async function ask(model,messages,signal){
 const result=await ollama('/api/chat',{model,messages,stream:false,options:{temperature:0.5,num_predict:1400}},signal);
 return clean(result.message?.content||'',120000);
}
const prompts={
 developer:'You are a careful senior software engineer. Give complete, runnable code when requested. State assumptions; include tests and security concerns. Never claim to execute or deploy code you did not run.',
 website:'You create accessible, mobile-responsive websites. Output a precise project structure, clean components, code, and deployment steps. Do not claim a deployed site.',
 marketing:'You are a practical marketing operator. Give useful original copy, a target audience, positioning, CTA, and measurable next actions. Do not invent product facts or testimonials.',
 research:'You are a researcher. Analyze ONLY supplied information. Cite uploaded document titles when applicable and clearly identify facts that cannot be verified. Do not pretend to have live web access.',
 prompts:'You are an expert prompt designer. Return a ready-to-use prompt with role, task, context, constraints and acceptance criteria.',
 qa:'You are a QA manager. Prepare clear evidence-based findings, scorecard suggestions and concise coaching. Do not assert a violation without proof.',
 chat:'You are an accurate, helpful AI assistant. State uncertainty and avoid inventing facts.'
};
app.get('/api/health',(_req,res)=>res.json({ok:true,name:'Theux Design AI Studio',version:'1.0.0'}));
app.get('/api/bootstrap',(_req,res)=>res.json({setupRequired:db.users.length===0,videoConfigured:!!process.env.MINIMAX_API_KEY}));
app.post('/api/setup',(req,res)=>{
 if(db.users.length)return failure(res,409,'Already configured');
 const origin=req.headers.origin||'';
 if(origin&&!isLoopbackOrigin(origin))return failure(res,403,'Initial setup is available only from localhost');
 const username=clean(req.body.username,120),password=String(req.body.password||'');
 if(!/^(?:[a-zA-Z0-9._-]{3,40}|[a-zA-Z0-9._%+-]{1,64}@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})$/.test(username)||password.length<12)return failure(res,400,'Use a valid username and password of at least 12 characters');
 const user={id:id(),username,role:'admin',passwordHash:passwordHash(password),createdAt:new Date().toISOString()};
 db.users.push(user);save();
 res.status(201).json({token:tokenFor(user),user:{id:user.id,username:user.username,role:user.role}});
});
app.post('/api/login',(req,res)=>{
 if(!rate(req.ip))return failure(res,429,'Too many attempts; retry in 10 minutes');
 const user=db.users.find(x=>x.username.toLowerCase()===clean(req.body.username,120).toLowerCase());
 if(!user||!passwordVerify(String(req.body.password||''),user.passwordHash))return failure(res,401,'Invalid credentials');
 res.json({token:tokenFor(user),user:{id:user.id,username:user.username,role:user.role}});
});
app.post('/api/logout',auth,(req,res)=>{tokens.delete(req.headers.authorization.replace(/^Bearer\s+/i,''));res.json({ok:true})});
app.get('/api/me',auth,(req,res)=>res.json({id:req.user.id,username:req.user.username,role:req.user.role}));
app.get('/api/users',auth,admin,(_req,res)=>res.json(db.users.map(u=>({id:u.id,username:u.username,role:u.role}))));
app.post('/api/users',auth,admin,(req,res)=>{
 const username=clean(req.body.username,120),password=String(req.body.password||''),role='member';
 if(!/^(?:[a-zA-Z0-9._-]{3,40}|[a-zA-Z0-9._%+-]{1,64}@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})$/.test(username)||password.length<12)return failure(res,400,'Username or password invalid; minimum 12 characters');
 if(db.users.some(u=>u.username.toLowerCase()===username.toLowerCase()))return failure(res,409,'User exists');
 const u={id:id(),username,role,passwordHash:passwordHash(password),createdAt:new Date().toISOString()};
 db.users.push(u);save();res.status(201).json({id:u.id,username,role});
});
app.get('/api/catalog',auth,(_req,res)=>res.json({studios,groups}));
app.get('/api/status',auth,async(req,res)=>{
 let models=[],ollamaOnline=false,ollamaError='';
 try{const data=await ollama('/api/tags');models=(data.models||[]).map(x=>({name:x.name,size:x.size}));ollamaOnline=true;}
 catch(e){ollamaError='Ollama is not reachable at '+(process.env.OLLAMA_URL||'http://127.0.0.1:11434')}
 res.json({ollamaOnline,ollamaError,models,videoConfigured:!!process.env.MINIMAX_API_KEY,storage:home,users:req.user.role==='admin'?db.users.length:undefined});
});
app.post('/api/chat',auth,async(req,res)=>{
 const model=clean(req.body.model,120),question=clean(req.body.question,12000);
 if(!model||!question)return failure(res,400,'Choose a model and enter a question');
 const mode=clean(req.body.mode||'chat',20);
 const history=Array.isArray(req.body.history)?req.body.history.slice(-12).filter(x=>['user','assistant'].includes(x.role)).map(x=>({role:x.role,content:clean(x.content,12000)})):[];
 let context='';
 if(req.body.useKnowledge){
  const docs=db.documents.filter(d=>d.owner===req.user.id);
  const hits=snippets(docs,question,6);
  context=hits.length?'Relevant excerpts:\n'+hits.map(h=>'['+h.title+'] '+h.text).join('\n\n'):'No relevant text was found in the uploaded documents. Say so; do not invent citations.';
 }
 try{
  const answer=await ask(model,[{role:'system',content:(prompts[mode]||prompts.chat)+'\n'+context},...history,{role:'user',content:question}]);
  res.json({answer,model});
 }catch(e){failure(res,502,'Local model error: '+e.message)}
});
app.post('/api/arena',auth,async(req,res)=>{
 const a=clean(req.body.modelA,120),b=clean(req.body.modelB,120),question=clean(req.body.question,12000);
 if(!a||!b||!question)return failure(res,400,'Select two models and a question');
 try{const [one,two]=await Promise.allSettled([ask(a,[{role:'user',content:question}]),ask(b,[{role:'user',content:question}])]);
 res.json({left:{model:a,answer:one.status==='fulfilled'?one.value:null,error:one.status==='rejected'?String(one.reason.message):null},right:{model:b,answer:two.status==='fulfilled'?two.value:null,error:two.status==='rejected'?String(two.reason.message):null}});
 }catch(e){failure(res,502,e.message)}
});
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:15*1024*1024}});
app.get('/api/documents',auth,(req,res)=>res.json(db.documents.filter(d=>d.owner===req.user.id).map(({text,...d})=>({...d,characters:text.length}))));
app.post('/api/documents',auth,upload.single('file'),async(req,res)=>{
 if(!req.file)return failure(res,400,'Choose a file');
 const ext=path.extname(req.file.originalname).toLowerCase();
 if(!['.pdf','.txt','.md','.csv','.json','.log'].includes(ext))return failure(res,415,'Supported: PDF, TXT, MD, CSV, JSON, LOG');
 try{
  let text=ext==='.pdf'?(await pdfParse(req.file.buffer)).text:req.file.buffer.toString('utf8');
  text=clean(text,200000);
  if(!text)return failure(res,422,'No readable text found; scanned PDFs need an OCR module');
  const doc={id:id(),owner:req.user.id,name:safeName(req.file.originalname),text,createdAt:new Date().toISOString()};
  db.documents.push(doc);save();
  res.status(201).json({id:doc.id,name:doc.name,characters:text.length});
 }catch(e){failure(res,422,'Document could not be processed: '+e.message)}
});
app.delete('/api/documents/:id',auth,(req,res)=>{
 const before=db.documents.length;db.documents=db.documents.filter(x=>!(x.id===req.params.id&&x.owner===req.user.id));
 if(before===db.documents.length)return failure(res,404,'Not found');save();res.json({ok:true});
});
app.post('/api/pdf',auth,async(req,res)=>{
 const title=clean(req.body.title,100)||'Theux AI Report',body=clean(req.body.body,60000);
 if(!body)return failure(res,400,'Enter the PDF content');
 const pdf=await PDFDocument.create();const font=await pdf.embedFont(StandardFonts.Helvetica);const bold=await pdf.embedFont(StandardFonts.HelveticaBold);
 const W=595,H=842,margin=48;let page=pdf.addPage([W,H]),y=H-60;
 page.drawText(title.replace(/[^\x20-\x7e]/g,'?'),{x:margin,y,size:17,font:bold,color:rgb(.36,.16,.7)});y-=39;
 const maxWidth=W-margin*2;
 for(const paragraph of body.replace(/[^\x0a\x20-\x7e]/g,'?').split('\n')){
  const words=paragraph.split(' ');let line='';
  const lines=[];
  for(const word of words){const candidate=line?line+' '+word:word;if(font.widthOfTextAtSize(candidate,11)>maxWidth&&line){lines.push(line);line=word;}else line=candidate;}
  lines.push(line);
  for(const l of lines){if(y<50){page=pdf.addPage([W,H]);y=H-55;}page.drawText(l.slice(0,250),{x:margin,y,size:11,font,color:rgb(.83,.82,.9)});y-=17;}
  y-=7;
 }
 const bytes=await pdf.save();res.setHeader('Content-Type','application/pdf');res.setHeader('Content-Disposition','attachment; filename="theux-report.pdf"');res.send(Buffer.from(bytes));
});
const workflows={
 'Content Launch':['Write a positioning statement and target audience for the following project:','Create three concise social posts and one email campaign from this plan:','Create a short landing page headline, CTA, and launch checklist from:'],
 'Developer Review':['Write a technical architecture and requirements brief for:','Identify risks, security concerns and test cases for the following design:','Create a prioritized implementation checklist with acceptance criteria for:'],
 'Research Brief':['Extract key claims and gaps from the following material:','Challenge unsupported assumptions and list needed evidence for:','Prepare a clear executive summary and follow-up actions from:']
};
let running=false;
for(const job of db.jobs){if(job.status==='running'){job.status='failed';job.error='Interrupted by server restart. Retry to run again.';}}
save();
async function processJobs(){
 if(running)return;running=true;
 try{
  while(true){
   const job=db.jobs.find(j=>j.status==='queued');
   if(!job)break;
   const controller=new AbortController();controllers.set(job.id,controller);
   job.status='running';job.startedAt=new Date().toISOString();save();
   try{
    const steps=workflows[job.workflow]||workflows['Research Brief'];
    let input=job.input;
    for(let i=0;i<steps.length;i++){
     if(controller.signal.aborted)throw new Error('Stopped');
     const result=await ask(job.model,[{role:'system',content:'Return useful output. Do not claim actions you did not perform.'},{role:'user',content:steps[i]+'\n\n'+input}],controller.signal);
     job.logs.push({step:i+1,title:steps[i],result,at:new Date().toISOString()});
     input=result;save();
    }
    job.status='completed';job.result=input;
   }catch(e){job.status=controller.signal.aborted?'cancelled':'failed';job.error=String(e.message||e);}
   job.finishedAt=new Date().toISOString();controllers.delete(job.id);save();
  }
 }finally{running=false}
}
app.get('/api/workflows',auth,(req,res)=>res.json({templates:Object.keys(workflows),jobs:db.jobs.filter(j=>j.owner===req.user.id).slice(-30).reverse()}));
app.post('/api/workflows',auth,(req,res)=>{
 const workflow=clean(req.body.workflow,50),input=clean(req.body.input,15000),model=clean(req.body.model,120);
 if(!workflows[workflow]||!input||!model)return failure(res,400,'Choose workflow, model and input');
 if(db.jobs.filter(j=>j.owner===req.user.id&&['queued','running'].includes(j.status)).length>=3)return failure(res,429,'At most three active jobs per user');
 const job={id:id(),owner:req.user.id,workflow,input,model,status:'queued',logs:[],createdAt:new Date().toISOString()};
 db.jobs.push(job);save();setImmediate(processJobs);res.status(202).json(job);
});
app.post('/api/workflows/:id/cancel',auth,(req,res)=>{
 const job=db.jobs.find(j=>j.id===req.params.id&&j.owner===req.user.id);
 if(!job)return failure(res,404,'Job not found');
 if(job.status==='queued'){job.status='cancelled';save();}
 if(job.status==='running')controllers.get(job.id)?.abort();
 res.json({ok:true});
});
app.post('/api/workflows/:id/retry',auth,(req,res)=>{
 const job=db.jobs.find(j=>j.id===req.params.id&&j.owner===req.user.id);
 if(!job||!['failed','cancelled'].includes(job.status))return failure(res,409,'Only failed or cancelled jobs can be retried');
 job.status='queued';job.logs=[];job.error='';save();setImmediate(processJobs);res.json({ok:true});
});
async function miniFetch(url,options){
 const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),60000);
 try{
  const response=await fetch(url,{...options,signal:controller.signal,headers:{Authorization:'Bearer '+process.env.MINIMAX_API_KEY,'Content-Type':'application/json',...(options.headers||{})}});
  const json=await response.json();
  if(!response.ok||json.base_resp?.status_code)throw new Error(json.base_resp?.status_msg||json.message||'MiniMax API error');
  return json;
 }finally{clearTimeout(timer)}
}
app.get('/api/videos',auth,(req,res)=>res.json(db.videos.filter(x=>x.owner===req.user.id).slice(-25).reverse()));
app.post('/api/videos',auth,async(req,res)=>{
 if(!process.env.MINIMAX_API_KEY)return failure(res,409,'Set MINIMAX_API_KEY in your local .env file to enable billed video generation');
 const prompt=clean(req.body.prompt,7001),duration=Number(req.body.duration||5),ratio=clean(req.body.ratio||'16:9',8);
 if(!prompt||prompt.length>7000||!Number.isInteger(duration)||duration<4||duration>15||!['16:9','9:16','1:1','4:3','3:4','21:9'].includes(ratio))return failure(res,400,'Invalid prompt, ratio or duration (4–15 seconds)');
 if(req.body.confirmCost!==true)return failure(res,400,'Explicit cost confirmation is required');
 const base=(process.env.MINIMAX_BASE_URL||'https://api.minimax.io').replace(/\/$/,'');
 const price=(duration*0.13).toFixed(2); // USD official listed H3 2K output price, excludes input materials.
 try{
  const result=await miniFetch(base+'/v2/video_generation',{method:'POST',body:JSON.stringify({model:'MiniMax-H3',content:[{type:'text',text:prompt}],resolution:'2K',duration,ratio})});
  const taskId=String(result.task_id||result.data?.task_id||'');
  if(!taskId)return failure(res,502,'MiniMax did not return a task ID');
  const item={id:id(),owner:req.user.id,taskId,prompt,duration,ratio,estimatedOutputUSD:price,status:'submitted',createdAt:new Date().toISOString()};
  db.videos.push(item);save();res.status(202).json(item);
 }catch(e){failure(res,502,'MiniMax failed: '+e.message)}
});
app.get('/api/videos/:id',auth,async(req,res)=>{
 const item=db.videos.find(x=>x.id===req.params.id&&x.owner===req.user.id);if(!item)return failure(res,404,'Not found');
 if(!process.env.MINIMAX_API_KEY)return failure(res,409,'MiniMax key missing');
 const base=(process.env.MINIMAX_BASE_URL||'https://api.minimax.io').replace(/\/$/,'');
 try{
  const result=await miniFetch(base+'/v2/query/video_generation/'+encodeURIComponent(item.taskId),{method:'GET'});
  const task=result.task||result.data||result;
  item.status=String(task.status||task.state||'processing');
  item.videoUrl=task.content?.url||task.video_url||task.video?.url||task.output?.video_url||item.videoUrl||null;
  item.error=task.error?.message||null;save();res.json({item,provider:result});
 }catch(e){failure(res,502,'MiniMax status check failed: '+e.message)}
});

app.post('/api/pdf/merge',auth,upload.array('files',6),async(req,res)=>{
 const files=req.files||[];
 if(files.length<2)return failure(res,400,'Upload at least two PDF files');
 if(files.some(f=>path.extname(f.originalname).toLowerCase()!=='.pdf'))return failure(res,415,'Only PDF files allowed');
 try{
  const merged=await PDFDocument.create();
  for(const f of files){const src=await PDFDocument.load(f.buffer);const pages=await merged.copyPages(src,src.getPageIndices());for(const page of pages)merged.addPage(page);}
  const bytes=await merged.save();
  res.setHeader('Content-Type','application/pdf');res.setHeader('Content-Disposition','attachment; filename="theux-merged.pdf"');res.send(Buffer.from(bytes));
 }catch(e){failure(res,422,'PDF merge failed: '+e.message)}
});
app.post('/api/csv/analyze',auth,upload.single('file'),async(req,res)=>{
 if(!req.file||path.extname(req.file.originalname).toLowerCase()!=='.csv')return failure(res,415,'Choose a CSV file');
 try{
  const rows=parseCSV(req.file.buffer.toString('utf8'),{columns:true,skip_empty_lines:true,bom:true,relax_quotes:true,skip_records_with_error:true,to:20001});
  if(!rows.length)return failure(res,422,'CSV is empty or unreadable');
  const columns=Object.keys(rows[0]).slice(0,80);
  const summary=columns.map(c=>{
   const values=rows.map(x=>String(x[c]??'').trim());
   const nonempty=values.filter(Boolean),numbers=nonempty.filter(v=>v!==''&&Number.isFinite(Number(v))).map(Number);
   const isNumeric=nonempty.length>0&&numbers.length>=nonempty.length*.95;
   return {column:c,missing:values.length-nonempty.length,unique:new Set(nonempty).size,...(isNumeric?{min:Math.min(...numbers),max:Math.max(...numbers),avg:Math.round(numbers.reduce((a,b)=>a+b,0)/numbers.length*100)/100}:{} )};
  });
  res.json({filename:safeName(req.file.originalname),rows:rows.length,columns:columns.length,summary,preview:rows.slice(0,5)});
 }catch(e){failure(res,422,'Could not parse CSV: '+e.message)}
});

app.use((err,req,res,next)=>{
 if(err instanceof multer.MulterError)return failure(res,413,'Upload limit: 15 MB');
 if(err.message==='Origin not approved')return failure(res,403,'Origin not approved by CORS_ORIGIN');
 console.error('[error]',err.message);failure(res,500,'Unexpected server error');
});
if(process.env.NODE_ENV!=='test'){
 setImmediate(processJobs);
 app.listen(port,process.env.HOST||'127.0.0.1',()=>{console.log('[Theux AI] backend on http://'+(process.env.HOST||'127.0.0.1')+':'+port);console.log('[Theux AI] data in '+home);if(!db.users.length)console.log('[Theux AI] Open local frontend and create the initial super admin account.')});
}
export {app};
