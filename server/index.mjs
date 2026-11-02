import {installOpuscar} from './opuscar.mjs';
import {installAudioStudio} from './audio-studio.mjs';
import {installLocalAudio} from './audio.mjs';
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
import {spawn,spawnSync} from 'node:child_process';
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

const wanRoot=path.resolve(process.env.WAN_ROOT||path.join(home,'wan-video','Wan2.1'));
const wanModel=path.resolve(process.env.WAN_MODEL_DIR||path.join(home,'wan-video','Wan2.1-T2V-1.3B'));
const wanBundledPython=path.join(home,'wan-video','venv-amd','Scripts','python.exe');
const wanPython=process.env.WAN_PYTHON||(fs.existsSync(wanBundledPython)?wanBundledPython:'python');
let activeWan=null;
// Mark abandoned processes after restart. Keep full records in diagnostic exports.
for(const v of db.videos){
 if(v.engine==='local'&&v.status==='running'){
  v.status='interrupted';v.error='Video process ended when the backend restarted. See saved logs.';
 }
}
save();
function wanReady(){return fs.existsSync(path.join(wanRoot,'generate.py'))&&fs.existsSync(path.join(wanModel,'config.json'))}
app.get('/api/local-video/status',auth,(_req,res)=>res.json({configured:wanReady(),active:!!activeWan,model:'Wan2.1 T2V 1.3B'}));
// Clean workspace: only current jobs and successful results; historical failures remain in combined logs.
app.get('/api/local-video',auth,(req,res)=>res.json(db.videos.filter(v=>v.owner===req.user.id&&v.engine==='local'&&['running','completed'].includes(v.status)&&!v.archived).slice(-20).reverse().map(v=>{
 if(v.status!=='running')return v;
 const now=Date.now(),last=v.lastActivityAt||Date.parse(v.createdAt)||now;
 const silenceMinutes=Math.floor(Math.max(0,now-last)/60000);
 const denoisingDone=v.stepsTotal>0&&v.stepsDone>=v.stepsTotal;
 return {...v,live:{processRunning:activeWan?.id===v.id&&activeWan.child.exitCode===null,processId:activeWan?.id===v.id?activeWan.child.pid:null,minutesWithoutOutput:silenceMinutes,awaitingMp4:denoisingDone,mp4Saved:fs.existsSync(path.join(home,'videos',v.id+'.mp4')),attention:silenceMinutes>=15?'No output for '+silenceMinutes+' minutes. The video may still be decoding; do not restart until the process exits or reports an error.':null}};
})));
app.get('/api/local-video/history',auth,(req,res)=>res.json(db.videos.filter(v=>v.owner===req.user.id&&v.engine==='local'&&!['running','completed'].includes(v.status)).slice(-50).reverse()));
app.post('/api/local-video/clear-errors',auth,(req,res)=>{
 let count=0;
 for(const v of db.videos){
  if(v.owner===req.user.id&&v.engine==='local'&&['failed','cancelled','interrupted'].includes(v.status)&&!v.archived){v.archived=true;count++;}
 }
 save();res.json({ok:true,archived:count,message:'Old errors hidden. Diagnostics retained in the combined log.'});
});


// Long-form storyboarding: each scene is independently generated by Wan and held
// using repeated frames to a 10-second beat. This is NOT 120s of unique motion.
function longScenePrompts(prompt,count){
 const sections=String(prompt).split(/(?:\n\s*\n|\b(?:scene|chapter)\s*\d+\s*[:—-])/i).map(x=>x.trim()).filter(x=>x.length>20);
 const seed=sections.length>1?sections:[String(prompt)];
 const angles=['Wide establishing shot with natural camera drift','Close-up of subjects moving naturally','Medium side-angle tracking shot','Ground-level view of unfolding action','Slow dolly through the environment','Overhead aerial viewpoint','Foreground-to-background cinematic composition','Wide dramatic silhouette composition'];
 return Array.from({length:count},(_,i)=>[seed[i%seed.length].slice(0,500),angles[i%angles.length], 'Scene '+(i+1)+' of '+count+', distinct composition, one uninterrupted natural action, cinematic realism. No subtitles or on-screen words.'].join('. ').slice(0,900));
}
function spawned(command,args,options={}){
 return new Promise((resolve,reject)=>{
  const child=spawn(command,args,{windowsHide:true,...options});
  let stderr='';child.stderr?.on('data',b=>stderr=(stderr+String(b)).slice(-5000));
  child.once('error',reject);
  child.once('close',code=>code===0?resolve(stderr):reject(Error(command+' exited '+code+': '+stderr.slice(-1500))));
 });
}
async function buildLongVideo(item,authorization){
 const dir=path.join(home,'videos'),work=path.join(dir,item.id+'-scenes');
 fs.mkdirSync(work,{recursive:true});
 const sceneCount=item.sceneCount,seconds=item.targetSeconds;
 const plan=longScenePrompts(item.prompt,sceneCount);
 fs.writeFileSync(path.join(work,'storyboard.json'),JSON.stringify(plan,null,2));
 const modelArgs=['--task','t2v-1.3B','--size',item.ratio==='9:16'?'480*832':'832*480','--frame_num','33','--sample_steps','20','--ckpt_dir',wanModel,'--offload_model','True','--t5_cpu','--sample_shift','8','--sample_guide_scale','6'];
 const patchScript=path.resolve(path.join(path.dirname(fileURLToPath(import.meta.url)),'patch-wan-amd.py'));
 const update=(stage)=>{item.stage=stage;item.lastActivityAt=Date.now();save()};
 try{
  if(process.platform==='win32'){
   update('Preparing AMD video engine');
   const patch=spawnSync(wanPython,[patchScript,'--wan-root',wanRoot],{encoding:'utf8',timeout:30000,windowsHide:true});
   if(patch.error||patch.status!==0)throw Error('AMD setup failed: '+(patch.stderr||patch.error?.message||'unknown error'));
  }
  const manifest=[];
  for(let i=0;i<sceneCount;i++){
   const sceneFile=path.join(work,'scene-'+String(i+1).padStart(3,'0')+'.mp4');
   item.currentScene=i+1;item.progress=Math.round(i/sceneCount*95);
   update('Generating distinct scene '+(i+1)+' of '+sceneCount);
   if(!fs.existsSync(sceneFile)){
    await new Promise((resolve,reject)=>{
     const args=['generate.py',...modelArgs,'--prompt',plan[i],'--save_file',sceneFile];
     const child=spawn(wanPython,args,{cwd:wanRoot,windowsHide:true,env:{...process.env,PYTHONUNBUFFERED:'1',PYTHONIOENCODING:'utf-8',PYTHONUTF8:'1'}});
     activeWan={child,id:item.id};item.processId=child.pid;save();
     const logfile=fs.createWriteStream(path.join(work,'scene-'+(i+1)+'.log'),{flags:'a'});
     child.stdout.on('data',b=>{logfile.write(b);item.lastActivityAt=Date.now()});
     child.stderr.on('data',b=>{logfile.write(b);item.lastActivityAt=Date.now()});
     child.once('error',e=>{logfile.end();reject(e)});
     child.once('close',code=>{logfile.end();if(item.status==='cancelled')reject(Error('Generation cancelled'));else if(code!==0||!fs.existsSync(sceneFile))reject(Error('Scene '+(i+1)+' failed, check scene log'));else resolve()});
    });
   }
   const held=path.join(work,'held-'+String(i+1).padStart(3,'0')+'.mp4');
   update('Building scene timeline '+(i+1)+' of '+sceneCount);
   await spawned(process.env.FFMPEG_PATH||'ffmpeg',['-hide_banner','-nostdin','-y','-stream_loop','-1','-i',sceneFile,'-t','10','-vf','fps=16,format=yuv420p','-an','-c:v','libx264','-preset','veryfast','-movflags','+faststart',held]);
   manifest.push(held);
  }
  const concat=path.join(work,'concat.txt');
  fs.writeFileSync(concat,manifest.map(p=>"file '"+p.replace(/'/g,"'\\''").replace(/\\/g,'/')+"'").join('\n'));
  update('Joining '+sceneCount+' scenes into '+seconds/60+'-minute movie');
  const out=path.join(dir,item.id+'.mp4');
  await spawned(process.env.FFMPEG_PATH||'ffmpeg',['-hide_banner','-nostdin','-y','-f','concat','-safe','0','-i',concat,'-c','copy','-movflags','+faststart',out]);
  if(!fs.existsSync(out)||fs.statSync(out).size<1024)throw Error('Final MP4 missing');
  item.status='completed';item.progress=100;update('Complete — '+sceneCount+' distinct scenes (short movements repeated within each)');
  activeWan=null;
  await finishAudioAutomatically(item,authorization);
 }catch(e){
  item.status=item.status==='cancelled'?'cancelled':'failed';item.error=e.message;item.stage='Long-form generation failed';activeWan=null;save();
 }
}
// Narration is opt-in from the prompt. Avoid triggering on "no narration" instructions.
function requestedNarration(prompt){
 const p=String(prompt||'');
 return !/\b(no|without|exclude|omit)\s+(?:any\s+)?(?:narration|narrator|voice[ -]?over|spoken words|speech)\b/i.test(p)&&/\b(narrat(?:e|ion|or)|voice[ -]?over|spoken commentary|speaks?|says?|dialogue)\b/i.test(p);
}
function narrationScript(prompt){
 const p=String(prompt||'').trim();
 const m=p.match(/(?:narrator|voice[ -]?over|narration)\s*(?:says?|reads?|:)?\s*["“]([^"”]{4,1000})["”]/i);
 if(m)return m[1];
 return 'In this scene, '+p.replace(/\b(?:add|include|with)\s+(?:a\s+)?(?:narrator|voice[ -]?over)\b/ig,'').replace(/\s+/g,' ').slice(0,500).replace(/[.!?]*$/,'')+'.';
}
async function longNarration(item){
 if(!item.targetSeconds)return narrationScript(item.prompt);
 const exact=String(item.prompt).match(/(?:narrator|voice[ -]?over|narration)\s*(?:says?|reads?|:)?\s*["“]([^"”]{4,5500})["”]/i);
 if(exact)return exact[1];
 const words=Math.round(item.targetSeconds*1.75);
 const task='Write a coherent English documentary voice-over for a '+item.targetSeconds+'-second movie, around '+words+' spoken words. Describe this story and its developing visual scenes realistically, without asserting details not in the brief. Narration only, no labels or timestamps. Story: '+item.prompt;
 try{
  const out=await ollama('/api/generate',{model:process.env.THEUX_NARRATION_MODEL||'qwen3:8b',prompt:task,stream:false,options:{num_predict:Math.min(1300,Math.max(350,Math.ceil(words*1.6)))}});
  if(typeof out.response==='string'&&out.response.trim().split(/\s+/).length>40)return out.response.trim().slice(0,5500);
 }catch(e){item.autoAudioWarning='Local narration script generation unavailable; using storyboard narration: '+e.message;save()}
 const scenes=longScenePrompts(item.prompt,item.sceneCount);
 return scenes.map((p,i)=>'As the story continues, '+p.replace(/Scene \d+ of \d+[^.]*\./,'').slice(0,150)+'.').join(' ').slice(0,5500);
}
async function finishAudioAutomatically(item,authorization){
 // Multi-scene rendering can outlive the original 12-hour login session.
 // Mint a short-lived internal token for this video's actual owner only.
 const owner=db.users.find(u=>u.id===item.owner);
 if(!owner)throw Error('Video owner no longer exists');
 const temporaryToken=tokenFor(owner);
 const base='http://127.0.0.1:'+port,headers={Authorization:'Bearer '+temporaryToken,'Content-Type':'application/json'};
 const request=async(endpoint,body)=>{
  const response=await fetch(base+endpoint,{method:'POST',headers,body:JSON.stringify(body)});
  if(!response.ok)throw Error((await response.text()).slice(0,350));
 };
 const track=(status,stage,error='')=>{item.autoAudioStatus=status;item.autoAudioStage=stage;item.autoAudioError=error;save()};
 const basePath='/api/audio-studio/'+encodeURIComponent(item.id);
 try{
  track('running','Searching and placing sound effects');
  await request(basePath+'/auto',{});
  const deadline=Date.now()+12*60*1000;
  while(Date.now()<deadline){
   await new Promise(resolve=>setTimeout(resolve,4000));
   const state=item.studio?.status;
   if(['completed','failed','interrupted'].includes(state))break;
  }
  if(item.studio?.status!=='completed'){
   item.autoAudioWarning=item.studio?.error||'Sound effects unavailable; continuing with narration';
  }
 }catch(e){item.autoAudioWarning='Automatic sound effects: '+e.message}
 if(item.narrationConfig?.enabled){
  try{
   track('running','Generating spoken narration');
   const narration=await longNarration(item);item.narrationText=narration;save();
   await request(basePath+'/narrate',{
    text:narration,
    engine:item.narrationConfig.engine,
    style:item.narrationConfig.style,
    speed:item.narrationConfig.speed
   });
   track('running','Mixing voice with the video');
  }catch(e){track('failed','Narration failed',e.message);return}
 }else track(item.studio?.status==='completed'?'completed':'failed','Soundtrack processing finished',item.autoAudioWarning||'');
}
app.post('/api/local-video',auth,(req,res)=>{
 if(!wanReady())return failure(res,409,'Install the local video engine using INSTALL-LOCAL-VIDEO.bat and restart the backend.');
 if(activeWan)return failure(res,409,'A local video is already generating.');
 const prompt=clean(req.body.prompt,1000),ratio=req.body.ratio==='9:16'?'9:16':'16:9';
 if(!prompt)return failure(res,400,'Enter a video prompt');
 const narrationEnabled=requestedNarration(prompt);
 const voiceChoice=req.body?.narration||{};
 const narrationConfig={enabled:narrationEnabled,engine:voiceChoice.engine==='chatterbox'?'chatterbox':'windows',style:['calm','documentary','warm','inspirational','emotional','dramatic','sermon'].includes(voiceChoice.style)?voiceChoice.style:'documentary',speed:[.74,.9,1,1.15].includes(Number(voiceChoice.speed))?Number(voiceChoice.speed):.9};
 const renderAuthorization=req.headers.authorization||'';
 const targetSeconds=[120,180,300].includes(Number(req.body?.targetSeconds))?Number(req.body.targetSeconds):0;
 const item={narrationConfig,autoAudioStatus:'waiting-for-video',id:id(),owner:req.user.id,engine:'local',model:'Wan2.1-T2V-1.3B',prompt,ratio,status:'running',logs:[],createdAt:new Date().toISOString(),stage:'Starting video engine',stepsDone:0,stepsTotal:20,progress:null};
 if(targetSeconds){
  // Reserve the local GPU before scheduling the long-form worker.
  activeWan={id:item.id,child:null};
  item.targetSeconds=targetSeconds;item.sceneCount=targetSeconds/10;item.currentScene=0;
  item.stage='Preparing '+item.sceneCount+' scene movie';db.videos.push(item);save();
  setImmediate(()=>buildLongVideo(item,renderAuthorization));
  return res.status(202).json(item);
 }
 const folder=path.join(home,'videos');fs.mkdirSync(folder,{recursive:true});
 const output=path.join(folder,item.id+'.mp4');
 const logFile=path.join(folder,item.id+'.log');
 item.logFile=logFile;
 const logStream=fs.createWriteStream(logFile,{flags:'a'});
 let pendingSave=null;
 const updateProgress=(chunk)=>{
  const value=String(chunk);
  if(value.trim())item.lastActivityAt=Date.now();
  if(/Creating WanT2V pipeline/i.test(value))item.stage='Initializing model';
  if(/loading .*models_t5/i.test(value))item.stage='Loading text encoder';
  if(/loading .*Wan2.1_VAE/i.test(value))item.stage='Loading video decoder';
  if(/Creating WanModel/i.test(value))item.stage='Loading video model';
  if(/Generating video/i.test(value)){item.stage='Generating video frames';item.generationStartedAt=Date.now();item.progress=0}
  if(/Saving generated video|Saving video|saving.*mp4/i.test(value)){item.stage='Encoding MP4';item.lastActivityAt=Date.now()}
  if(/decode|decoding/i.test(value)){item.stage='Decoding video frames';item.lastActivityAt=Date.now()}
  // tqdm emits carriage returns, and individual writes can split a progress row.
  const combined=(item.progressTail||'')+value;
  const matches=[...combined.matchAll(/(\d{1,3})%\|[^\r\n]*?\|\s*(\d+)\/(\d+)\s*\[/g)];
  if(matches.length){
   const last=matches[matches.length-1],done=Number(last[2]),total=Number(last[3]);
   if(total>0&&done>=0&&done<=total){
    item.stepsDone=done;item.stepsTotal=total;item.progress=Math.round(done/total*100);
    item.lastStepAt=Date.now();item.lastActivityAt=Date.now();
    item.stage=done===total?'Denoising complete — decoding video (MP4 not saved yet)':'Generating video frames';
    if(done===total){item.denoiseCompletedAt=Date.now();item.etaSeconds=null;}
    if(done>0&&item.generationStartedAt){
     const elapsed=(Date.now()-item.generationStartedAt)/1000;
     item.etaSeconds=Math.max(0,Math.ceil(elapsed/done*(total-done)));
    }
   }
  }
  item.progressTail=combined.slice(-250);
 };
 const appendLog=(level,chunk)=>{
  updateProgress(chunk);
  const line='['+new Date().toISOString()+'] '+level+': '+String(chunk);
  logStream.write(line+(line.endsWith('\n')?'':'\n'));
  item.logs.push(line.slice(-4000));
  item.logs=item.logs.slice(-120);
  if(!pendingSave)pendingSave=setTimeout(()=>{pendingSave=null;save()},500);
 };
 db.videos.push(item);save();
 // AMD 16 GB VRAM / 32 GB RAM: lower temporal context and sampler workload.
 const frameCount=33,sampleSteps=20;
 item.frameCount=frameCount;item.stepsTotal=sampleSteps;item.memoryMode='AMD low-memory';
 const args=['generate.py','--task','t2v-1.3B','--size',ratio==='9:16'?'480*832':'832*480','--frame_num',String(frameCount),'--sample_steps',String(sampleSteps),'--ckpt_dir',wanModel,'--prompt',prompt,'--offload_model','True','--t5_cpu','--sample_shift','8','--sample_guide_scale','6','--save_file',output];
 const patchScript=path.resolve(path.join(path.dirname(fileURLToPath(import.meta.url)),'patch-wan-amd.py'));
 if(process.platform==='win32'){
  const preflight=spawnSync(wanPython,[patchScript,'--wan-root',wanRoot],{encoding:'utf8',timeout:30000,windowsHide:true});
  if(preflight.error||preflight.status!==0){
   item.status='failed';item.error='Windows single-GPU patch failed: '+(preflight.stderr||preflight.error?.message||preflight.stdout||'unknown error').slice(-1600);
   appendLog('PREFLIGHT',item.error);save();logStream.end();
   return failure(res,500,item.error);
  }
  appendLog('PREFLIGHT',preflight.stdout);
 }
 const child=spawn(wanPython,args,{cwd:wanRoot,windowsHide:true,env:{...process.env,PYTHONUNBUFFERED:'1',PYTHONIOENCODING:'utf-8',PYTHONUTF8:'1'}});
 activeWan={child,id:item.id};item.processId=child.pid;item.lastActivityAt=Date.now();save();
 child.stdout.on('data',chunk=>appendLog('OUT',chunk));
 child.stderr.on('data',chunk=>appendLog('ERR',chunk));
 child.on('error',e=>{appendLog('SPAWN ERROR',e.stack||e.message);item.status='failed';item.error=e.message;activeWan=null;if(pendingSave)clearTimeout(pendingSave);pendingSave=null;save();logStream.end()});
 child.on('close',code=>{
  if(item.status!=='cancelled'){item.status=code===0&&fs.existsSync(output)?'completed':'failed';if(item.status==='failed')item.error='Video engine exit code '+code+'; inspect logs for ROCm/PyTorch issues.';}
  if(item.status==='completed'){item.progress=100;item.stage='Complete';item.etaSeconds=0}
  if(item.status==='completed')setImmediate(()=>finishAudioAutomatically(item,renderAuthorization).catch(e=>{item.autoAudioStatus='failed';item.autoAudioError=e.message;save()}));
  else if(item.status==='failed')item.stage='Failed';
  appendLog('EXIT','process exited with code '+code);
  if(item.status==='failed'){
   const relevant=item.logs.slice(-12).join('').match(/(?:ModuleNotFoundError|ImportError|RuntimeError|AssertionError|Error):[^\n]+/g);
   if(relevant?.length)item.error=relevant[relevant.length-1].slice(0,1000);
  }
  activeWan=null;if(pendingSave)clearTimeout(pendingSave);pendingSave=null;save();logStream.end();
 });
 res.status(202).json(item);
});
installLocalAudio(app,{auth,db,home,save,failure});
installAudioStudio(app,{auth,db,home,save,failure});
installOpuscar(app,{auth,db,home,save,failure});
app.get('/api/local-video/combined-logs',auth,(req,res)=>{
 const jobs=db.videos.filter(v=>v.owner===req.user.id&&v.engine==='local').sort((a,b)=>String(a.createdAt).localeCompare(String(b.createdAt)));
 const chunks=['THEUX AI - COMBINED LOCAL VIDEO LOG','Exported: '+new Date().toISOString(),'Jobs: '+jobs.length,'='.repeat(72)];
 for(const v of jobs){
  const filepath=path.join(home,'videos',v.id+'.log');
  let log='No log recorded for this job.';
  if(fs.existsSync(filepath))log=fs.readFileSync(filepath,'utf8');
  else if(Array.isArray(v.logs)&&v.logs.length)log=v.logs.join('\n');
  chunks.push(['','='.repeat(72),'JOB: '+v.id,'DATE: '+(v.createdAt||'Unknown')+' STATUS: '+v.status,'MODEL: '+(v.model||'Unknown')+' RATIO: '+(v.ratio||'Unknown'),'PROMPT: '+(v.prompt||''),'ERROR: '+(v.error||'None recorded'),'-'.repeat(72),log].join('\n'));
 }
 res.setHeader('Content-Type','text/plain; charset=utf-8');
 res.setHeader('Content-Disposition','attachment; filename="theux-all-video-logs.txt"');
 res.send(chunks.join('\n')+'\n');
});

app.get('/api/local-video/:id/logs',auth,(req,res)=>{
 const v=db.videos.find(v=>v.id===req.params.id&&v.owner===req.user.id&&v.engine==='local');
 if(!v)return failure(res,404,'Video not found');
 const log=path.join(home,'videos',v.id+'.log');
 const content=fs.existsSync(log)?fs.readFileSync(log,'utf8').slice(-100000):v.logs?.join('\n')||'No logs recorded for this job.';
 res.json({id:v.id,status:v.status,error:v.error||null,log:content});
});
app.get('/api/local-video/:id',auth,(req,res)=>{
 const v=db.videos.find(v=>v.id===req.params.id&&v.owner===req.user.id&&v.engine==='local');if(!v)return failure(res,404,'Video not found');res.json(v);
});
app.post('/api/local-video/:id/stop',auth,(req,res)=>{
 const v=db.videos.find(v=>v.id===req.params.id&&v.owner===req.user.id&&v.engine==='local');
 if(!v||v.status!=='running'||activeWan?.id!==v.id)return failure(res,409,'Video not running');
 v.status='cancelled';activeWan.child.kill();save();res.json({ok:true});
});
// Long-form export is an explicitly labeled loop of the completed clip, not new Wan-generated action.
app.post('/api/local-video/:id/extend',auth,(req,res)=>{
 const v=db.videos.find(x=>x.id===req.params.id&&x.owner===req.user.id&&x.engine==='local'&&x.status==='completed');
 if(!v)return failure(res,404,'Completed clip required');
 const seconds=Number(req.body?.seconds);
 if(![120,180,300].includes(seconds))return failure(res,400,'Choose 2, 3, or 5 minutes');
 if(v.extendStatus==='running')return failure(res,409,'Long-form export already running');
 const original=path.join(home,'videos',v.id+'.mp4'),target=path.join(home,'videos',v.id+'-'+seconds+'s-loop.mp4');
 if(!fs.existsSync(original))return failure(res,404,'Video file not available');
 v.extendStatus='running';v.extendSeconds=seconds;v.extendError='';save();
 const args=['-hide_banner','-nostdin','-y','-stream_loop','-1','-i',original,'-t',String(seconds),'-map','0:v:0','-an','-c:v','libx264','-preset','veryfast','-pix_fmt','yuv420p','-movflags','+faststart',target];
 const child=spawn(process.env.FFMPEG_PATH||'ffmpeg',args,{windowsHide:true,stdio:['ignore','ignore','pipe']});
 let stderr='';child.stderr.on('data',d=>stderr=(stderr+String(d)).slice(-3000));
 child.on('error',e=>{v.extendStatus='failed';v.extendError=e.message;save()});
 child.on('close',code=>{if(v.extendStatus==='failed')return;
  if(code===0&&fs.existsSync(target)&&fs.statSync(target).size>1024){v.extendStatus='completed';v.extendFile=path.basename(target)}
  else {v.extendStatus='failed';v.extendError=stderr.slice(-500)||'Export failed'}
  save();
 });
 res.status(202).json({status:'running',seconds,notice:'This repeats the original short clip; it does not generate new scenes.'});
});
app.get('/api/local-video/:id/extended-download',auth,(req,res)=>{
 const v=db.videos.find(x=>x.id===req.params.id&&x.owner===req.user.id&&x.engine==='local'&&x.status==='completed'&&x.extendStatus==='completed');
 if(!v||!v.extendFile)return failure(res,404,'Extended MP4 not ready');
 res.download(path.join(home,'videos',path.basename(v.extendFile)),'theux-'+v.extendSeconds+'s-loop.mp4');
});
app.get('/api/local-video/:id/download',auth,(req,res)=>{
 const v=db.videos.find(v=>v.id===req.params.id&&v.owner===req.user.id&&v.engine==='local'&&v.status==='completed');
 if(!v)return failure(res,404,'Video not available');
 res.download(path.join(home,'videos',v.id+'.mp4'),'theux-video.mp4');
});

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
