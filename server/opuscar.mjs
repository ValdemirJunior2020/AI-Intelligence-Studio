import fs from 'node:fs';
import path from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
const require=createRequire(import.meta.url);
const options=['16:9','9:16','1:1'];
const dims={'16:9':[832,468],'9:16':[468,832],'1:1':[640,640]};
const styles=['minimal','cinematic','infographic','cartoon','neon','blueprint'];
const palette={minimal:['#191325','#ba9fe9','#66e6d4'],cinematic:['#111525','#f6b65c','#93c7d8'],infographic:['#101a32','#76a5f8','#86e5a9'],cartoon:['#2b1f40','#ffaecb','#fbd26c'],neon:['#08091d','#d468ff','#58f6e9'],blueprint:['#07182a','#7ac3f8','#e3f5fa']};
const blocked=/\b(?:script|import|require|eval|function|fetch|XMLHttpRequest|process|child_process|powershell|cmd\.exe|http:\/\/|https:\/\/)\b/i;
function safeText(s,n=400){return String(s||'').replace(/[\x00-\x1f<>]/g,' ').trim().slice(0,n)}
export function validateAnimationPlan(raw,{duration=8,style='cinematic'}={}){
 const obj=typeof raw==='string'?JSON.parse(raw):raw;
 if(!obj||!Array.isArray(obj.scenes)||!obj.scenes.length||obj.scenes.length>24)throw Error('Ollama plan must contain 1–24 scenes');
 const scenes=obj.scenes.map((c,i)=>{
  if(!c||typeof c!=='object')throw Error('Invalid scene '+(i+1));
  const title=safeText(c.title,120),description=safeText(c.description,420);
  if(!title||!description||blocked.test(title+' '+description))throw Error('Unsupported or unsafe scene instructions');
  const motion=['float','slide','orbit','pulse','rise','wave'].includes(c.motion)?c.motion:'float';
  const objects=Array.isArray(c.objects)?c.objects.slice(0,12).map(o=>({
   type:['circle','square','triangle','star'].includes(o?.type)?o.type:'circle',
   x:Math.max(0,Math.min(1,Number(o?.x)||.5)),y:Math.max(0,Math.min(1,Number(o?.y)||.5)),
   size:Math.max(.03,Math.min(.45,Number(o?.size)||.12)),
   color:/^#[0-9a-f]{6}$/i.test(o?.color||'')?o.color:palette[style]?.[1]||'#ba9fe9'
  })):[];
  return {title,description,motion,objects};
 });
 return {scenes,style:styles.includes(style)?style:'cinematic',duration:Math.max(2,Math.min(300,Number(duration)||8))};
}
export function animationFrameSource(){
 // Trusted application code only. Ollama JSON is data, never run via eval or script injection.
 return String.raw`(function(){
  window.drawFrame=(plan,t,w,h)=>{
   const canvas=document.querySelector('canvas'),ctx=canvas.getContext('2d');
   const colors=window.colors||['#191325','#ba9fe9','#66e6d4'];
   const g=ctx.createLinearGradient(0,0,w,h);g.addColorStop(0,colors[0]);g.addColorStop(1,'#090816');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
   const count=plan.scenes.length,index=Math.min(count-1,Math.floor(t/(plan.duration/count))),scene=plan.scenes[index];
   const local=(t-index*plan.duration/count)/(plan.duration/count),p=local*Math.PI*2;
   ctx.fillStyle=colors[1];ctx.globalAlpha=.08;
   for(let i=0;i<18;i++){ctx.beginPath();ctx.arc((w*(i*0.173+local*.07)%w),h*(i*.241%1),7+i%5*8,0,Math.PI*2);ctx.fill();}
   ctx.globalAlpha=1;
   let objects=scene.objects.length?scene.objects:Array.from({length:6},(_,i)=>({type:['circle','square','triangle'][i%3],x:.12+.15*i,y:.35+.08*Math.sin(i),size:.09,color:colors[1+i%2]}));
   for(let i=0;i<objects.length;i++){
    const o=objects[i],dx=scene.motion==='slide'?(local-.5)*.18:scene.motion==='orbit'?Math.cos(p+i)*.045:Math.sin(p+i)*.018;
    const dy=scene.motion==='rise'?-(local-.5)*.16:Math.cos(p+i)*.03;
    const scale=scene.motion==='pulse'?1+.2*Math.sin(p*2+i):1;
    const x=w*(o.x+dx),y=h*(o.y+dy),r=Math.min(w,h)*o.size*scale;
    ctx.fillStyle=o.color;ctx.globalAlpha=.8;
    ctx.save();ctx.translate(x,y);ctx.rotate(Math.sin(p+i)*.2);ctx.beginPath();
    if(o.type==='square'){ctx.roundRect(-r,-r,r*2,r*2,r*.14);}
    else if(o.type==='triangle'){ctx.moveTo(0,-r);ctx.lineTo(r,r);ctx.lineTo(-r,r);ctx.closePath();}
    else if(o.type==='star'){for(let k=0;k<10;k++){const a=k*Math.PI/5-Math.PI/2,q=k%2?r*.45:r;ctx.lineTo(Math.cos(a)*q,Math.sin(a)*q)}ctx.closePath();}
    else ctx.arc(0,0,r,0,Math.PI*2);
    ctx.fill();ctx.restore();
   }
   ctx.globalAlpha=1;ctx.fillStyle='#f8f5ff';ctx.textAlign='center';ctx.font='bold '+Math.round(Math.min(w,h)*.055)+'px Arial';
   ctx.fillText(scene.title.slice(0,55),w/2,h*.79,w*.87);
   ctx.font=Math.round(Math.min(w,h)*.024)+'px Arial';ctx.fillStyle='#d0c6e6';
   ctx.fillText(scene.description.slice(0,100),w/2,h*.86,w*.9);
   ctx.globalAlpha=.35;ctx.fillRect(w*.08,h*.92,w*.84*local,3);ctx.globalAlpha=1;
  };
})();`;
}
function commandReady(cmd,args=['-version']){const r=spawnSync(cmd,args,{windowsHide:true,timeout:5000,encoding:'utf8'});return !r.error&&r.status===0}
async function ollamaRequest(base,route,body,signal){
 const url=new URL(route,base);
 if(!['localhost','127.0.0.1','[::1]'].includes(url.hostname))throw Error('Ollama must use localhost');
 const ctrl=new AbortController(),tm=setTimeout(()=>ctrl.abort(),120000);
 signal?.addEventListener('abort',()=>ctrl.abort(),{once:true});
 try{const r=await fetch(url,{method:body?'POST':'GET',headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:ctrl.signal});
 if(!r.ok)throw Error('Ollama HTTP '+r.status+': '+(await r.text()).slice(0,250));return await r.json()}
 finally{clearTimeout(tm)}
}
function pickJson(s){const a=s.indexOf('{'),b=s.lastIndexOf('}');if(a<0||b<a)throw Error('Ollama did not return JSON');return s.slice(a,b+1)}
export function installOpuscar(app,{auth,db,home,save,failure}){
 const jobs=db.opuscarJobs||(db.opuscarJobs=[]),running=new Map(),outputDir=path.join(home,'opuscar');
 fs.mkdirSync(outputDir,{recursive:true});
 for(const j of jobs)if(j.status==='running'||j.status==='queued'){j.status='interrupted';j.error='Backend restarted; retry to render again'}
 save();
 const own=(req)=>jobs.find(x=>x.id===req.params.id&&x.owner===req.user.id);
 const base=process.env.OLLAMA_URL||'http://127.0.0.1:11434';
 const ffmpeg=process.env.FFMPEG_PATH||'ffmpeg';
 app.get('/api/opuscar/status',auth,async(_req,res)=>{
  let models=[],ollamaOnline=false,issue='';
  try{const tags=await ollamaRequest(base,'/api/tags');models=(tags.models||[]).map(m=>m.name);ollamaOnline=true}catch(e){issue=e.message}
  let browser=false;
  try{const {chromium}=require('playwright');browser=Boolean(chromium.executablePath()&&fs.existsSync(chromium.executablePath()))}catch{}
  res.json({ollamaOnline,models,ffmpeg:commandReady(ffmpeg),browser,engine:'Lemo-Opuscar compatible canvas renderer',gpuAcceleration:'Unverified (Chromium automatic fallback)',supportedStyles:styles,error:issue});
 });
 app.get('/api/opuscar/jobs',auth,(req,res)=>res.json(jobs.filter(j=>j.owner===req.user.id).slice(-40).reverse()));
 app.post('/api/opuscar/generate',auth,async(req,res)=>{
  const prompt=safeText(req.body?.prompt,1400),model=safeText(req.body?.model,120),duration=Number(req.body?.duration);
  const ratio=options.includes(req.body?.ratio)?req.body.ratio:'16:9';
  const style=styles.includes(req.body?.style)?req.body.style:'cinematic';
  if(prompt.length<8||!model||!Number.isFinite(duration)||duration<2||duration>300)return failure(res,400,'Enter prompt, Ollama model and duration (2–300 seconds)');
  if(jobs.some(j=>j.owner===req.user.id&&j.status==='running'))return failure(res,409,'A local animation is already running');
  const j={id:randomUUID(),owner:req.user.id,engine:'opuscar',prompt,model,duration,ratio,style,status:'running',stage:'Planning animation with Ollama',progress:0,logs:[],createdAt:new Date().toISOString()};
  jobs.push(j);save();res.status(202).json(j);
  const controller=new AbortController();running.set(j.id,controller);
  const log=(msg)=>{j.stage=msg;j.logs.push(new Date().toISOString()+' '+msg);j.logs=j.logs.slice(-100);save()};
  (async()=>{
   const tags=await ollamaRequest(base,'/api/tags',null,controller.signal);
   if(!(tags.models||[]).some(m=>m.name===model))throw Error('Selected Ollama model is not installed');
   if(!commandReady(ffmpeg))throw Error('FFmpeg unavailable. Run INSTALL-LOCAL-OPUSCAR.bat');
   let chromium;try{({chromium}=require('playwright'))}catch{throw Error('Playwright not installed. Run INSTALL-LOCAL-OPUSCAR.bat')}
   if(!fs.existsSync(chromium.executablePath()))throw Error('Playwright Chromium missing. Run INSTALL-LOCAL-OPUSCAR.bat');
   const instruction='Respond with ONLY JSON: {"scenes":[{"title":"short label","description":"visual","motion":"float|slide|orbit|pulse|rise|wave","objects":[{"type":"circle|square|triangle|star","x":0.5,"y":0.4,"size":0.12,"color":"#ab99ff"}]}]}. Produce 2-8 distinct scenes for this animated video. No HTML, no code, no markdown. This is abstract motion graphics, not photorealistic imagery. Request: '+prompt;
   const planReply=await ollamaRequest(base,'/api/generate',{model,prompt:instruction,stream:false,format:'json',options:{temperature:.3,num_predict:1700}},controller.signal);
   const plan=validateAnimationPlan(pickJson(planReply.response||''),{duration,style});
   j.plan=plan;log('Validated '+plan.scenes.length+' scenes; preparing sandboxed Canvas');
   if(controller.signal.aborted)throw Error('Cancelled');
   const [w,h]=dims[ratio],fps=8,total=Math.round(duration*fps);
   let browser;let ff;
   try{
    browser=await chromium.launch({headless:true,args:['--disable-gpu','--disable-extensions','--no-first-run','--disable-background-networking']});
    const context=await browser.newContext({viewport:{width:w,height:h},deviceScaleFactor:1,serviceWorkers:'block',javaScriptEnabled:true});
    await context.route('**/*',route=>route.abort());
    const page=await context.newPage();
    await page.setContent('<!doctype html><html><body style="margin:0;background:#100c20"><canvas width="'+w+'" height="'+h+'"></canvas></body></html>');
    await page.addScriptTag({content:animationFrameSource()});
    await page.evaluate(colors=>window.colors=colors,palette[style]);
    const outfile=path.join(outputDir,j.id+'.mp4');
    ff=spawn(ffmpeg,['-hide_banner','-loglevel','error','-y','-f','image2pipe','-framerate',String(fps),'-c:v','mjpeg','-i','pipe:0','-an','-c:v','libx264','-preset','veryfast','-pix_fmt','yuv420p','-movflags','+faststart',outfile],{windowsHide:true,stdio:['pipe','ignore','pipe']});
    let fferr='';ff.stderr.on('data',b=>fferr=(fferr+String(b)).slice(-2500));
    let exitCode;const exited=new Promise((resolve,reject)=>{ff.once('error',reject);ff.once('close',code=>{exitCode=code;resolve(code)})});
    const stop=()=>{ff.kill();ff.stdin.destroy()};controller.signal.addEventListener('abort',stop,{once:true});
    for(let f=0;f<total;f++){
     if(controller.signal.aborted)throw Error('Cancelled');
     await page.evaluate(({plan,t,w,h})=>window.drawFrame(plan,t,w,h),{plan,t:f/fps,w,h});
     const jpg=await page.screenshot({type:'jpeg',quality:80});
     if(!ff.stdin.write(jpg))await new Promise((resolve,reject)=>{ff.stdin.once('drain',resolve);ff.stdin.once('error',reject)});
     if(f%8===0){j.progress=Math.round(100*f/total);j.stage='Rendering frame '+(f+1)+'/'+total;save()}
    }
    ff.stdin.end();await exited;
    if(exitCode!==0)throw Error('FFmpeg encode failed: '+fferr);
    if(!fs.existsSync(outfile)||fs.statSync(outfile).size<2048)throw Error('MP4 file missing or too small');
    if(!commandReady('ffprobe',['-v','error','-select_streams','v:0','-show_entries','stream=codec_name','-of','default=nw=1',outfile]))throw Error('MP4 validation failed (ffprobe)');
    j.output=path.basename(outfile);j.status='completed';j.progress=100;log('Playable MP4 verified');
   }finally{if(ff&&!ff.killed&&j.status!=='completed'){ff.kill();ff.stdin.destroy()}await browser?.close().catch(()=>{})}
  })().catch(e=>{j.status=controller.signal.aborted?'cancelled':'failed';j.error=String(e.message||e).slice(0,900);log('Stopped: '+j.error)}).finally(()=>{running.delete(j.id);save()});
 });
 app.post('/api/opuscar/:id/stop',auth,(req,res)=>{const j=own(req);if(!j)return failure(res,404,'Video not found');const c=running.get(j.id);if(!c)return failure(res,409,'Job not running');c.abort();res.json({ok:true})});
 app.post('/api/opuscar/:id/retry',auth,async(req,res)=>{
  const j=own(req);if(!j)return failure(res,404,'Video not found');
  if(!['failed','cancelled','interrupted'].includes(j.status))return failure(res,409,'Only stopped or failed jobs can be retried');
  // Re-enter the same authenticated creation route rather than executing stale code.
  try{
   const url='http://127.0.0.1:'+(process.env.PORT||4317)+'/api/opuscar/generate';
   const reply=await fetch(url,{method:'POST',headers:{Authorization:req.headers.authorization||'','Content-Type':'application/json'},body:JSON.stringify({prompt:j.prompt,model:j.model,duration:j.duration,ratio:j.ratio,style:j.style})});
   const body=await reply.json();return res.status(reply.status).json(body);
  }catch(e){return failure(res,502,'Retry request failed: '+e.message)}
 });
 app.get('/api/opuscar/:id/download',auth,(req,res)=>{const j=own(req);if(!j||j.status!=='completed'||!j.output)return failure(res,404,'Completed MP4 not found');const p=path.join(outputDir,path.basename(j.output));if(!fs.existsSync(p))return failure(res,404,'MP4 missing');res.download(p,'theux-opuscar-'+j.id+'.mp4')});
}
