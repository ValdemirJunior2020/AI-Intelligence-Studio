import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';

// Openverse indexes third-party media. License and host availability are not guaranteed.
// Search results are cached server-side; callers can only select results actually returned by Openverse.
export function installLocalAudio(app,{auth,db,home,save,failure}){
 const choices=new Map();
 const allowed=new Set(['cc0','pdm','by','by-sa']);
 const outputDir=path.join(home,'videos');
 const getVideo=(req)=>db.videos.find(v=>v.id===req.params.id&&v.owner===req.user.id&&v.engine==='local'&&v.status==='completed');
 const findSound=(req)=>{const sounds=choices.get(req.user.id)||[];return sounds.find(s=>s.id===req.body.soundId)};
 const validUrl=s=>{try{const u=new URL(s);return u.protocol==='https:'&&!u.username&&!u.password&&!/^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(u.hostname)}catch{return false}};
 app.get('/api/local-audio/search',auth,async(req,res)=>{
  const q=String(req.query.q||'').trim().slice(0,120);
  if(!q)return failure(res,400,'Enter a sound search');
  try{
   const url=new URL('https://api.openverse.org/v1/audio/');
   url.searchParams.set('q',q);url.searchParams.set('page_size','15');
   url.searchParams.set('license','cc0,pdm,by,by-sa');
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
   let resp;try{resp=await fetch(url,{headers:{Accept:'application/json','User-Agent':'TheuxAI/1.0 (local sound search)'},signal:controller.signal})}finally{clearTimeout(timer)}
   if(!resp.ok)throw Error('Openverse responded with '+resp.status);
   const data=await resp.json();
   const sounds=(data.results||[]).filter(x=>allowed.has(String(x.license||'').toLowerCase())&&validUrl(x.url)&&x.id).slice(0,15).map(x=>({
    id:String(x.id),title:String(x.title||'Untitled').slice(0,200),creator:String(x.creator||'Unknown').slice(0,200),
    license:String(x.license).toLowerCase(),licenseUrl:x.license_url||null,sourceUrl:x.foreign_landing_url||null,
    audioUrl:x.url,attribution:String(x.attribution||'').slice(0,1500)
   }));
   choices.set(req.user.id,sounds);
   res.json({results:sounds.map(({audioUrl,...rest})=>rest),notice:'Check the original work and license before publishing. BY/BY-SA require attribution; BY-SA has share-alike obligations.'});
  }catch(e){failure(res,502,'Openverse sound search failed: '+e.message)}
 });
 app.post('/api/local-video/:id/add-audio',auth,(req,res)=>{
  const v=getVideo(req);if(!v)return failure(res,404,'A completed video is required');
  if(v.audioStatus==='running')return failure(res,409,'Audio already being added');
  const s=findSound(req);if(!s)return failure(res,400,'Search for a sound and select a returned result');
  if(req.body.licenseAcknowledged!==true)return failure(res,400,'Review and acknowledge the sound license first');
  const original=path.join(outputDir,v.id+'.mp4'),target=path.join(outputDir,v.id+'-with-audio.mp4');
  if(!fs.existsSync(original))return failure(res,404,'Original MP4 is missing');
  const gain=Number(req.body.volume);const volume=Number.isFinite(gain)?Math.max(0,Math.min(1.5,gain)):0.8;
  v.audioStatus='running';v.audioError='';save();
  // Separate process; no changes to Wan render or original MP4.
  const args=['-hide_banner','-nostdin','-y','-i',original,'-i',s.audioUrl,
   '-filter_complex','[1:a]volume='+volume+',apad[a]',
   '-map','0:v:0','-map','[a]','-c:v','copy','-c:a','aac','-b:a','160k','-shortest','-movflags','+faststart',target];
  const child=spawn(process.env.FFMPEG_PATH||'ffmpeg',args,{windowsHide:true,stdio:['ignore','ignore','pipe']});
  let stderr='';
  child.stderr.on('data',d=>{stderr=(stderr+String(d)).slice(-4500)});
  child.on('error',e=>{v.audioStatus='failed';v.audioError='ffmpeg unavailable: '+e.message;save()});
  child.on('close',code=>{
   if(v.audioStatus==='failed')return;
   if(code===0&&fs.existsSync(target)&&fs.statSync(target).size>1000){
    v.audioStatus='completed';v.audioFile=path.basename(target);
    v.audioCredit={title:s.title,creator:s.creator,license:s.license,licenseUrl:s.licenseUrl,sourceUrl:s.sourceUrl,attribution:s.attribution};
    fs.writeFileSync(path.join(outputDir,v.id+'-audio-credits.txt'),
     [s.title,'Creator: '+s.creator,'License: '+s.license,'License URL: '+(s.licenseUrl||''),'Source: '+(s.sourceUrl||''),'Attribution: '+s.attribution].join('\n'),'utf8');
   }else{v.audioStatus='failed';v.audioError=('Audio mixing failed: '+stderr.slice(-900)).slice(0,1100);try{fs.rmSync(target,{force:true})}catch{}}
   save();
  });
  res.status(202).json({status:'running',message:'Adding licensed sound to a separate MP4. Original video preserved.'});
 });
 app.get('/api/local-video/:id/audio-download',auth,(req,res)=>{
  const v=getVideo(req);if(!v||v.audioStatus!=='completed'||!v.audioFile)return failure(res,404,'Soundtrack MP4 not ready');
  res.download(path.join(outputDir,path.basename(v.audioFile)),'theux-video-with-audio.mp4');
 });
 app.get('/api/local-video/:id/audio-credits',auth,(req,res)=>{
  const v=getVideo(req);if(!v||!v.audioCredit)return failure(res,404,'Audio credits unavailable');
  res.type('text/plain').send([v.audioCredit.title,'Creator: '+v.audioCredit.creator,'License: '+v.audioCredit.license,'License URL: '+(v.audioCredit.licenseUrl||''),'Source: '+(v.audioCredit.sourceUrl||''),'Attribution: '+v.audioCredit.attribution].join('\n'));
 });
}
