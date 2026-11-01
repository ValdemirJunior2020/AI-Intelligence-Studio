import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import dns from 'node:dns/promises';
import net from 'node:net';
import {spawn,spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';

const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const asNum=(x,f=0)=>Number.isFinite(Number(x))?Number(x):f;
const tail=s=>String(s||'').slice(-2200);
const restricted=/^(localhost|.*\.localhost|.*\.local|.*\.internal)$/i;
function publicIp(ip){
 if(net.isIP(ip)===4){const a=ip.split('.').map(Number);return !(a[0]===0||a[0]===10||a[0]===127||a[0]>=224||a[0]===169&&a[1]===254||a[0]===172&&a[1]>=16&&a[1]<=31||a[0]===192&&a[1]===168||a[0]===100&&a[1]>=64&&a[1]<=127||a[0]===192&&a[1]===0||a[0]===198&&a[1]===18||a[0]===198&&a[1]===19);
 }
 if(net.isIP(ip)===6)return !/^(::1|::|f[cd]|fe[89ab]|ff|2001:db8)/i.test(ip)&&!ip.toLowerCase().startsWith('::ffff:');
 return false;
}
async function safeMediaUrl(input){
 const u=new URL(input);
 if(u.protocol!=='https:'||u.username||u.password||restricted.test(u.hostname))throw Error('Unsafe media URL');
 if(net.isIP(u.hostname)){if(!publicIp(u.hostname))throw Error('Private address forbidden')}
 else {const ips=await dns.lookup(u.hostname,{all:true});if(!ips.length||ips.some(i=>!publicIp(i.address)))throw Error('Media host resolves to a private address')}
 return u;
}
async function downloadSound(url,output){
 let next=url;
 for(let i=0;i<4;i++){
  await safeMediaUrl(next);
  const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),25000);
  let r;
  try{r=await fetch(next,{redirect:'manual',headers:{'User-Agent':'Theux-Audio-Studio/1.0'},signal:ctrl.signal});
   if([301,302,303,307,308].includes(r.status)){
    const to=r.headers.get('location');if(!to)throw Error('Sound redirect has no location');
    next=new URL(to,next).href;continue;
   }
   if(!r.ok)throw Error('Sound download HTTP '+r.status);
   const type=(r.headers.get('content-type')||'').toLowerCase();
   if(type.includes('text/html')||type.includes('application/json'))throw Error('Source returned a web page, not an audio file');
   const limit=24*1024*1024;let n=0,parts=[];
   for await(const part of r.body){n+=part.length;if(n>limit)throw Error('Sound file exceeds 24 MB');parts.push(part)}
   if(n<128)throw Error('Empty sound file');
   fs.writeFileSync(output,Buffer.concat(parts));return;
  }finally{clearTimeout(timer)}
 }
 throw Error('Too many sound redirects');
}
function run(command,args,options={}){
 return new Promise((resolve,reject)=>{
  const child=spawn(command,args,{windowsHide:true,stdio:['ignore','pipe','pipe'],...options});
  let stdout='',stderr='',timer,settled=false;
  const finish=(err,res)=>{if(settled)return;settled=true;if(timer)clearTimeout(timer);if(err)reject(err);else resolve(res)};
  if(options.timeoutMs)timer=setTimeout(()=>{child.kill();finish(Error('Timed out: '+command))},options.timeoutMs);
  child.stdout.on('data',x=>{stdout=(stdout+String(x)).slice(-120000)});
  child.stderr.on('data',x=>{stderr=(stderr+String(x)).slice(-12000)});
  child.on('error',e=>finish(e));
  child.on('close',code=>code===0?finish(null,{stdout,stderr}):finish(Error(command+' exited '+code+': '+tail(stderr||stdout))));
 });
}
const probe=process.env.FFPROBE_PATH||'ffprobe';
const ffmpeg=process.env.FFMPEG_PATH||'ffmpeg';
const earshotRoot=()=>path.resolve(process.env.EARSHOT_ROOT||path.join(process.cwd(),'data','earshot','repo'));
const earshotPython=()=>path.resolve(process.env.EARSHOT_PYTHON||path.join(process.cwd(),'data','earshot','venv',process.platform==='win32'?'Scripts/python.exe':'bin/python'));
function usable(exe,args=['-version']){
 try{const p=spawnSync(exe,args,{encoding:'utf8',windowsHide:true,timeout:7000});return p.status===0}catch{return false}
}
function timeSec(x,max){return Math.round(clamp(asNum(x),0,Math.max(0,max-.05))*100)/100}
function cleanSound(s){return String(s||'').replace(/[\n\r]/g,' ').trim().slice(0,120)}
export function starterCues(prompt,duration){
 const text=String(prompt||'').toLowerCase(),q=cleanSound(prompt)||'subtle ambient background';
 const query=/dog|puppy/.test(text)?(/bark/.test(text)?'dog barking':'dog footsteps and movement'):
  /cat|kitten/.test(text)?'cat meowing purring':
  /rain|storm/.test(text)?'rain ambience':
  /car|truck/.test(text)?'vehicle engine':
  /bird/.test(text)?'birds singing':
  /walk|footstep/.test(text)?'footsteps':
  /water|splash/.test(text)?'water splashing':
  /explod|impact|crash/.test(text)?'impact crash':
  q;
 return [{id:randomUUID(),at:Math.min(.15,duration*.05),query,gain:.75,sourceType:'none',candidateId:'',sfxId:'',approved:false,origin:'prompt-inferred',description:'Inferred from prompt. Adjust timing against the video.'}];
}
export function validateCues(cues,existing,duration){
 if(!Array.isArray(cues)||cues.length>12)throw Error('Maximum 12 sound cues');
 return cues.map(c=>{
  const prev=existing.find(x=>x.id===c.id);if(!prev)throw Error('Cue not found');
  const type=['none','openverse','earshot'].includes(c.sourceType)?c.sourceType:'none';
  const candidateId=String(c.candidateId||'');
  if(type==='openverse'&&!((prev.candidates||[]).some(s=>s.id===candidateId)))throw Error('Choose an Openverse result for the cue');
  return {...prev,at:timeSec(c.at,duration),query:cleanSound(c.query),gain:clamp(asNum(c.gain,.7),0,1.5),
   sourceType:type,candidateId:type==='openverse'?candidateId:'',sfxId:type==='earshot'?String(c.sfxId||'').slice(0,100):'',
   approved:type==='openverse'&&c.approved===true};
 });
}
async function getDuration(video){
 const r=await run(probe,['-v','error','-show_entries','format=duration:stream=r_frame_rate','-of','json',video],{timeoutMs:15000});
 const d=JSON.parse(r.stdout),duration=asNum(d.format?.duration);
 if(!duration||duration>1800)throw Error('Video duration unavailable or too long');
 const rate=(d.streams||[]).find(x=>x.r_frame_rate)?.r_frame_rate||'16/1';
 const [a,b]=rate.split('/').map(Number);const fps=clamp(a/b||16,1,120);
 return {duration:Math.round(duration*100)/100,fps};
}
async function sampleScene(input,at,model){
 const r=await run(ffmpeg,['-hide_banner','-loglevel','error','-ss',String(at),'-i',input,'-frames:v','1','-vf','scale=448:-2','-f','image2pipe','-vcodec','mjpeg','pipe:1'],
  {encoding:'buffer',timeoutMs:25000});return r.stdout;
}
// Frame extraction uses a buffer-compatible subprocess so no image is written to disk.
async function frameBuffer(input,at){
 return new Promise((resolve,reject)=>{
  const c=spawn(ffmpeg,['-hide_banner','-loglevel','error','-ss',String(at),'-i',input,'-frames:v','1','-vf','scale=448:-2','-f','image2pipe','-vcodec','mjpeg','pipe:1'],{windowsHide:true});
  const chunks=[];let n=0,err='';
  c.stdout.on('data',x=>{n+=x.length;if(n<3e6)chunks.push(x);else c.kill()});
  c.stderr.on('data',x=>err=(err+String(x)).slice(-500));
  c.on('error',reject);c.on('close',code=>code===0&&n>0&&n<3e6?resolve(Buffer.concat(chunks)):reject(Error('Frame decode failed: '+err)));
 });
}
async function visionCue(image,model,at){
 const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),85000);
 try{
  const r=await fetch(process.env.OLLAMA_URL||'http://127.0.0.1:11434/api/chat',{method:'POST',signal:ctrl.signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({
   model,stream:false,format:'json',options:{temperature:0,num_predict:150},
   messages:[{role:'user',content:'Describe ONLY visible physical objects and plausible sound-producing events in this single image. Do not claim to hear audio or know motion between frames. Respond JSON: {"needsSound": true/false, "query": "short sound effect search phrase", "description": "one sentence visual evidence"}. If no sound-related evidence, set needsSound false.',images:[image.toString('base64')]}]})});
  if(!r.ok)throw Error('Ollama vision HTTP '+r.status);
  const d=await r.json(),v=JSON.parse(d.message?.content||'{}');
  return v&&v.needsSound===true&&cleanSound(v.query)?{at,query:cleanSound(v.query),description:cleanSound(v.description||'Visual inference'),origin:'vision-inferred'}:null;
 }finally{clearTimeout(timer)}
}
async function openverse(query){
 const u=new URL('https://api.openverse.org/v1/audio/');u.searchParams.set('q',query);u.searchParams.set('page_size','8');u.searchParams.set('license','cc0,pdm,by');
 const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),18000);
 try{
  const r=await fetch(u,{headers:{Accept:'application/json'},signal:ctrl.signal});
  if(!r.ok)throw Error('Openverse HTTP '+r.status);
  const json=await r.json();
  return (json.results||[]).filter(x=>['cc0','pdm','by'].includes(String(x.license).toLowerCase())&&x.id&&x.url).slice(0,5).map(x=>({
   id:String(x.id),title:String(x.title||'Untitled').slice(0,160),creator:String(x.creator||'Unknown').slice(0,160),
   license:String(x.license).toLowerCase(),licenseUrl:x.license_url||'',sourceUrl:x.foreign_landing_url||'',
   url:x.url,attribution:String(x.attribution||'').slice(0,2000)
  }));
 }finally{clearTimeout(timer)}
}
async function mixWithFfmpeg(original,assets,duration,output,work){
 const inputs=['-i',original];
 for(const a of assets)inputs.push('-i',a.file);
 const filters=[];
 for(let i=0;i<assets.length;i++){
  const a=assets[i],delay=Math.round(a.at*1000);
  filters.push('['+(i+1)+':a:0]aresample=48000,aformat=channel_layouts=stereo,volume='+a.gain+
   ',adelay='+delay+'|'+delay+',apad,atrim=duration='+duration+',asetpts=N/SR/TB[a'+i+']');
 }
 const mixes=assets.map((_,i)=>'[a'+i+']').join('');
 filters.push(mixes+'amix=inputs='+assets.length+':duration=longest:dropout_transition=0,loudnorm=I=-16:TP=-1.5:LRA=9,atrim=duration='+duration+'[master]');
 await run(ffmpeg,['-hide_banner','-nostdin','-y',...inputs,'-filter_complex',filters.join(';'),'-map','0:v:0','-map','[master]','-c:v','copy','-c:a','aac','-b:a','192k','-t',String(duration),'-movflags','+faststart',output],{timeoutMs:240000});
}
async function mixRealSound(original,assets,duration,fps,output,work,python,root){
 const rs=path.join(root,'skills','real-sound','scripts','mix.py');
 if(!fs.existsSync(rs))throw Error('Real Sound mixer missing. Reinstall Earshot.');
 const samples={},pools={},rules=[],events=[];
 for(let i=0;i<assets.length;i++){
  const a=assets[i],key='s'+i;
  samples[key]={file:path.relative(work,a.file).replace(/\\/g,'/'),mono:false,fade_in:.005,fade_out:.07};
  pools[key]=[key];
  rules.push({name:'scene-'+i,match:{kind:'cue'+i},pool:key,mode:'fixed',align:'start',gain_db:Math.round(20*Math.log10(Math.max(.02,a.gain))*10)/10});
  events.push({f:Math.round(a.at*fps),kind:'cue'+i,id:'theux:audio:'+i,weight:1});
 }
 fs.mkdirSync(path.join(work,'audio'),{recursive:true});
 fs.mkdirSync(path.join(work,'out'),{recursive:true});
 fs.writeFileSync(path.join(work,'audio','sounddesign.json'),JSON.stringify({duration,cues:'out/cues.json',samples,pools,rules,master:{lufs:-14}},null,2));
 fs.writeFileSync(path.join(work,'out','cues.json'),JSON.stringify({fps,total:Math.round(fps*duration),events},null,2));
 const wav=path.join(work,'out','soundtrack.wav');
 await run(python,['-I',rs,'--root',work,'--design','audio/sounddesign.json','--cues','out/cues.json','--out','out/soundtrack.wav'],{timeoutMs:240000});
 await run(ffmpeg,['-hide_banner','-nostdin','-y','-i',original,'-i',wav,'-map','0:v:0','-map','1:a:0','-c:v','copy','-c:a','aac','-b:a','192k','-t',String(duration),'-movflags','+faststart',output],{timeoutMs:240000});
}
export function installAudioStudio(app,{auth,db,home,save,failure}){
 const outputDir=path.join(home,'videos');fs.mkdirSync(outputDir,{recursive:true});
 const root=path.resolve(process.env.EARSHOT_ROOT||path.join(home,'earshot','repo'));
 const python=path.resolve(process.env.EARSHOT_PYTHON||path.join(home,'earshot','venv',process.platform==='win32'?'Scripts/python.exe':'bin/python'));
 const studioOf=req=>db.videos.find(v=>v.id===req.params.id&&v.owner===req.user.id&&v.engine==='local'&&v.status==='completed');
 const ensure=req=>{const v=studioOf(req);if(!v)throw Error('Completed local video required');if(!fs.existsSync(path.join(outputDir,v.id+'.mp4')))throw Error('Original video file missing');return v};
 const progress=(v,stage)=>{v.studio.stage=stage;save()};
 for(const v of db.videos){if(v.studio&&['analyzing','matching','rendering'].includes(v.studio.status)){v.studio.status='interrupted';v.studio.stage='Interrupted by backend restart';}}
 save();
 app.get('/api/audio-studio/status',auth,(_req,res)=>{
  res.json({ffmpeg:usable(ffmpeg),ffprobe:usable(probe),earshot:fs.existsSync(python)&&fs.existsSync(path.join(root,'skills','real-sound','scripts','mix.py')),
   earshotHome:root,visionModel:process.env.THEUX_VISION_MODEL||'qwen3.5:9b',
   note:'Earshot is CPU-only; Real Sound handles licensed recordings. Vision cues are inferred from sampled still frames, not guaranteed actions.'});
 });
 app.get('/api/audio-studio/bank',auth,async(_req,res)=>{
  if(!fs.existsSync(python))return failure(res,409,'Install Earshot with INSTALL-LOCAL-AUDIO.bat');
  try{
   const r=await run(python,['-m','earshot','sfx','list','--json'],{cwd:root,timeoutMs:60000});
   let ids=[];
   try{const j=JSON.parse(r.stdout);const walk=x=>{if(Array.isArray(x))x.forEach(walk);else if(x&&typeof x==='object'){if(typeof x.id==='string')ids.push(x.id);else Object.values(x).forEach(walk)}};walk(j)}catch{}
   if(!ids.length)ids=[...r.stdout.matchAll(/\b(?:whoosh_fast|impact|pro_click|notify|typing_key|swish|pop|fit|tap|pro_impact)\/[a-z0-9_.-]+/gi)].map(x=>x[0]);
   res.json({ids:[...new Set(ids)].slice(0,300)});
  }catch(e){failure(res,502,'Earshot sound bank unavailable: '+e.message)}
 });
 app.get('/api/audio-studio/:id',auth,(req,res)=>{
  try{const v=ensure(req);res.json(v.studio||{status:'new',cues:[],stage:'Ready'})}catch(e){failure(res,404,e.message)}
 });
 app.post('/api/audio-studio/:id/analyze',auth,(req,res)=>{
  let v;try{v=ensure(req)}catch(e){return failure(res,404,e.message)}
  if(['analyzing','matching','rendering'].includes(v.studio?.status))return failure(res,409,'Audio Studio already working');
  v.studio={...v.studio,status:'analyzing',stage:'Reading video duration',cues:[],error:''};save();res.status(202).json({status:'analyzing'});
  (async()=>{
   const video=path.join(outputDir,v.id+'.mp4'),{duration,fps}=await getDuration(video);
   v.studio.duration=duration;v.studio.fps=fps;const selected=req.body?.vision!==false;
   const model=cleanSound(req.body?.model||process.env.THEUX_VISION_MODEL||'qwen3.5:9b');
   let cues=[],visionErrors=[];
   if(selected){
    const positions=[.12,.37,.62,.87].map(t=>Math.max(.05,t*duration));
    for(let i=0;i<positions.length;i++){
     progress(v,'Inspecting scene '+(i+1)+'/4 with local vision');
     try{
      const shot=await frameBuffer(video,positions[i]);
      const cue=await visionCue(shot,model,positions[i]);
      if(cue)cues.push({...cue,id:randomUUID(),gain:.75,sourceType:'none',candidateId:'',sfxId:'',approved:false});
     }catch(e){visionErrors.push(e.message);break}
    }
   }
   if(!cues.length)cues=starterCues(v.prompt,duration);
   v.studio.cues=cues;
   v.studio.visionUsed=cues.some(c=>c.origin==='vision-inferred');
   v.studio.visionNotice=v.studio.visionUsed?'Sampled still frames. Sound event timing is approximate; verify cues on the timeline.':
    (visionErrors.length?'Local vision unavailable: '+tail(visionErrors[0])+'. ':'')+'Cue inferred from prompt; timing requires review.';
   v.studio.status='ready';v.studio.stage='Cues ready for editing';save();
  })().catch(e=>{v.studio.status='failed';v.studio.error=e.message;v.studio.stage='Analysis failed';save()});
 });
 app.post('/api/audio-studio/:id/match',auth,(req,res)=>{
  let v;try{v=ensure(req)}catch(e){return failure(res,404,e.message)}
  if(v.studio?.status!=='ready')return failure(res,409,'Analyze video first');
  if(!v.studio.cues?.length)return failure(res,409,'Add a cue first');
  v.studio.status='matching';v.studio.error='';save();res.status(202).json({status:'matching'});
  (async()=>{
   for(let i=0;i<v.studio.cues.length;i++){
    const c=v.studio.cues[i];progress(v,'Searching licensed sounds '+(i+1)+'/'+v.studio.cues.length);
    c.candidates=await openverse(c.query);
   }
   v.studio.status='ready';v.studio.stage='Select sounds and review licenses';save();
  })().catch(e=>{v.studio.status='ready';v.studio.error='Openverse search: '+e.message;save()});
 });
 app.post('/api/audio-studio/:id/cues',auth,(req,res)=>{
  let v;try{v=ensure(req)}catch(e){return failure(res,404,e.message)}
  if(v.studio?.status!=='ready')return failure(res,409,'Audio Studio not ready');
  try{v.studio.cues=validateCues(req.body?.cues,v.studio.cues,v.studio.duration);save();res.json(v.studio)}
  catch(e){failure(res,400,e.message)}
 });
 app.post('/api/audio-studio/:id/render',auth,(req,res)=>{
  let v;try{v=ensure(req)}catch(e){return failure(res,404,e.message)}
  if(v.studio?.status!=='ready')return failure(res,409,'Analyze and save cues first');
  const cues=v.studio.cues.filter(c=>c.sourceType!=='none');
  if(!cues.length)return failure(res,400,'Select at least one sound on the timeline');
  if(cues.some(c=>c.sourceType==='openverse'&&!c.approved))return failure(res,400,'Review and approve each recording license before mixing');
  if(cues.some(c=>c.sourceType==='earshot'&&!c.sfxId))return failure(res,400,'Select an Earshot bank sound');
  if(!usable(ffmpeg)||!usable(probe))return failure(res,409,'FFmpeg and FFprobe are required. Run INSTALL-LOCAL-AUDIO.bat.');
  if(cues.some(c=>c.sourceType==='earshot')&&!fs.existsSync(python))return failure(res,409,'Earshot not installed. Run INSTALL-LOCAL-AUDIO.bat.');
  v.studio.status='rendering';v.studio.stage='Preparing audio assets';v.studio.error='';save();
  res.status(202).json({status:'rendering'});
  (async()=>{
   const work=path.join(outputDir,'studio',v.id);fs.mkdirSync(path.join(work,'assets'),{recursive:true});
   const input=path.join(outputDir,v.id+'.mp4'),target=path.join(outputDir,v.id+'-studio.mp4');
   const credits=[];
   const assets=[];
   const useReal=cues.every(c=>c.sourceType==='openverse');
   if(useReal&&!fs.existsSync(path.join(root,'skills','real-sound','scripts','mix.py')))throw Error('Install Earshot/Real Sound with INSTALL-LOCAL-AUDIO.bat.');
   for(let i=0;i<cues.length;i++){
    const c=cues[i],file=path.join(work,'assets',i+(c.sourceType==='earshot'?'.wav':'.audio'));
    progress(v,'Preparing sound '+(i+1)+'/'+cues.length);
    if(c.sourceType==='openverse'){
     const s=(c.candidates||[]).find(s=>s.id===c.candidateId);if(!s)throw Error('Openverse selection no longer available');
     await downloadSound(s.url,file);
     credits.push({title:s.title,creator:s.creator,license:s.license,licenseUrl:s.licenseUrl,sourceUrl:s.sourceUrl,attribution:s.attribution});
    }else{
     if(!/^[a-z0-9_-]+\/[a-z0-9_.-]+$/i.test(c.sfxId))throw Error('Invalid Earshot bank ID');
     await run(python,['-m','earshot','sfx','render',c.sfxId,'-o',file],{cwd:root,timeoutMs:120000});
     credits.push({title:'Earshot bank: '+c.sfxId,creator:'Earshot',license:'MIT (code-generated sound)',sourceUrl:'https://github.com/Leonxlnx/earshot'});
    }
    assets.push({file,at:c.at,gain:c.gain,query:c.query});
   }
   progress(v,useReal?'Real Sound: cue-aligned mixing and mastering':'Earshot: timeline mixing and mastering');
   if(useReal)await mixRealSound(input,assets,v.studio.duration,v.studio.fps,target,work,python,root);
   else await mixWithFfmpeg(input,assets,v.studio.duration,target,work);
   if(!fs.existsSync(target)||fs.statSync(target).size<1024)throw Error('Final video was not created');
   v.studio.output=path.basename(target);
   v.studio.credits=credits;
   v.studio.mixer=useReal?'Real Sound':'FFmpeg hybrid / Earshot SFX';
   fs.writeFileSync(path.join(work,'CREDITS.txt'),credits.map(c=>[c.title,'Creator: '+c.creator,'License: '+c.license,'License URL: '+(c.licenseUrl||''),'Source: '+(c.sourceUrl||''),'Attribution: '+(c.attribution||'')].join('\n')).join('\n\n'),'utf8');
   // Analysis is optional; failure never destroys a rendered movie.
   if(fs.existsSync(python)){
    try{const audio=path.join(work,'out','soundtrack.wav');if(fs.existsSync(audio)){progress(v,'Earshot audio QA');const qa=await run(python,['-m','earshot','measure',audio,'--json'],{cwd:root,timeoutMs:90000});v.studio.qa=qa.stdout.slice(-3000)}}catch(e){v.studio.qa='QA unavailable: '+e.message}
   }
   v.studio.status='completed';v.studio.stage='Video with soundtrack ready';save();
  })().catch(e=>{v.studio.status='failed';v.studio.error=e.message;v.studio.stage='Audio rendering failed';save()});
 });
 app.get('/api/audio-studio/:id/download',auth,(req,res)=>{
  let v;try{v=ensure(req)}catch(e){return failure(res,404,e.message)}
  if(v.studio?.status!=='completed'||!v.studio.output)return failure(res,404,'Audio video not ready');
  res.download(path.join(outputDir,path.basename(v.studio.output)),'theux-studio-with-audio.mp4');
 });
 app.get('/api/audio-studio/:id/credits',auth,(req,res)=>{
  let v;try{v=ensure(req)}catch(e){return failure(res,404,e.message)}
  const p=path.join(outputDir,'studio',v.id,'CREDITS.txt');
  if(!fs.existsSync(p))return failure(res,404,'No credits yet');
  res.download(p,'theux-sound-credits.txt');
 });
}
