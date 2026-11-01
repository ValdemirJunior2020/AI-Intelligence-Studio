import React,{useCallback,useEffect,useState} from 'react';
import {AudioLines,Clapperboard,Download,Headphones,Music2,Search,ShieldCheck,SlidersHorizontal,Sparkles,WandSparkles,RefreshCw,CheckCircle2,AlertCircle} from 'lucide-react';
import './audio-studio.css';

export default function AudioStudio({video,call,onError,onReload}){
 const [studio,setStudio]=useState({status:'new',cues:[]});
 const [narrationText,setNarrationText]=useState('');
 const [narratorEngine,setNarratorEngine]=useState('windows'),[narratorStyle,setNarratorStyle]=useState('documentary'),[narratorSpeed,setNarratorSpeed]=useState(.9),[voiceStatus,setVoiceStatus]=useState(null);
 useEffect(()=>{call('/api/audio-studio/voices/status').then(setVoiceStatus).catch(()=>{})},[call]);
 const [cues,setCues]=useState([]);
 const [available,setAvailable]=useState(null);
 const [bank,setBank]=useState([]);
 const [vision,setVision]=useState(true);
 const [model,setModel]=useState('');
 const [busy,setBusy]=useState(false);
 const [dirty,setDirty]=useState(false);
 const [notice,setNotice]=useState('');
 const read=useCallback(async()=>{try{const x=await call('/api/audio-studio/'+video.id);setStudio(x);if(!dirty)setCues(x.cues||[])}catch(e){setNotice(e.message)}},[call,video.id,dirty]);
 useEffect(()=>{read();call('/api/audio-studio/status').then(x=>{setAvailable(x);setModel(m=>m||x.visionModel)}).catch(()=>{})},[video.id,call]);
 useEffect(()=>{if(!['analyzing','matching','rendering','automatic'].includes(studio.status)&&studio.narrationStatus!=='running')return;
  const t=setInterval(()=>call('/api/audio-studio/'+video.id).then(x=>{setStudio(x);if(x.status==='ready'||x.status==='completed'||x.status==='failed'){setCues(x.cues||[]);setDirty(false);onReload?.()}}).catch(()=>{}),3000);
  return()=>clearInterval(t);
 },[studio.status,studio.narrationStatus,video.id,call,onReload]);
 const act=async(fn)=>{setBusy(true);setNotice('');try{await fn()}catch(e){setNotice(e.message);onError?.(e)}finally{setBusy(false)}};
 const analyze=(useVision)=>act(async()=>{await call('/api/audio-studio/'+video.id+'/analyze','POST',{vision:useVision,model});setStudio(s=>({...s,status:'analyzing',stage:'Analyzing video'}));setDirty(false)});
 const match=()=>act(async()=>{if(dirty)await save();await call('/api/audio-studio/'+video.id+'/match','POST',{});setStudio(s=>({...s,status:'matching',stage:'Searching Openverse'}))});
 const save=async()=>{const x=await call('/api/audio-studio/'+video.id+'/cues','POST',{cues:cues.map(({id,at,query,gain,sourceType,candidateId,sfxId,approved})=>({id,at,query,gain,sourceType,candidateId,sfxId,approved}))});setStudio(x);setCues(x.cues||[]);setDirty(false);return x};
 const render=()=>act(async()=>{if(dirty)await save();await call('/api/audio-studio/'+video.id+'/render','POST',{});setStudio(s=>({...s,status:'rendering',stage:'Preparing soundtrack'}))});
 const getBank=()=>act(async()=>{const x=await call('/api/audio-studio/bank');setBank(x.ids||[]);if(!x.ids?.length)setNotice('Earshot bank returned no sounds. Run the local audio installer.')});
 const download=async(suffix,name)=>act(async()=>{const blob=await call('/api/audio-studio/'+video.id+'/'+suffix,'GET',undefined,true);const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000)});
 const edit=(id,key,value)=>{setCues(old=>old.map(c=>c.id===id?{...c,[key]:value,...(key==='sourceType'?{approved:false,candidateId:'',sfxId:''}:{})}:c));setDirty(true)};
 const working=['analyzing','matching','rendering','automatic'].includes(studio.status);
 const ready=studio.status==='ready';
 const duration=Number(studio.duration)||2.1;
 const picked=cues.filter(c=>c.sourceType!=='none').length;
 return <section className="sound-studio">
  <div className="sound-studio__head">
   <div className="sound-studio__mark"><AudioLines size={22}/></div>
   <div><div className="sound-studio__eyebrow">THEUX DESIGN / SOUND DEPARTMENT</div><h3>Audio Intelligence Studio</h3><p>Scene-aware cues · Openverse recordings · Earshot forge · Real Sound mixing</p></div>
   <span className={'sound-studio__status '+(studio.status==='completed'?'sound-studio__status--done':'')}>{studio.status==='completed'?'Soundtrack ready':working?'Processing':ready?'Edit timeline':'Ready to analyze'}</span>
  </div>
  <div className="sound-studio__engines">
   <span><Clapperboard size={14}/> Vision cues {studio.visionUsed?'· inferred from frames':'· optional'}</span>
   <span><Music2 size={14}/> Openverse / Real Sound</span>
   <span><Headphones size={14}/> Earshot {available?.earshot?'installed':'installation needed'}</span>
   <span><ShieldCheck size={14}/> License review</span>
  </div>
  {available&&(!available.ffmpeg||!available.ffprobe)&&<div className="sound-studio__warning"><AlertCircle size={16}/> FFmpeg / FFprobe missing. Run <b>INSTALL-LOCAL-AUDIO.bat</b> from your project folder.</div>}
  {!available?.earshot&&<div className="sound-studio__hint">Real Sound and Earshot bank effects require a one-time free installation: <b>INSTALL-LOCAL-AUDIO.bat</b>. This installs a separate CPU environment and does not modify the AMD video environment.</div>}
  <div className="sound-studio__actions"><button className="sound-studio__btn sound-studio__btn--primary" disabled={busy||working||studio.status==='completed'} onClick={()=>act(async()=>{await call('/api/audio-studio/'+video.id+'/auto','POST',{});setStudio(s=>({...s,status:'automatic',stage:'Auto-detecting and mixing sounds'}))})}><WandSparkles size={15}/> Auto soundtrack — one click</button>
   <label className="sound-studio__model"><input type="checkbox" checked={vision} onChange={e=>setVision(e.target.checked)}/> Analyze sampled video frames using local Ollama</label>
   {vision&&<input aria-label="Local vision model" className="sound-studio__model-input" placeholder="Local Ollama vision model" value={model} onChange={e=>setModel(e.target.value)}/>}
   <button disabled={busy||working} className="sound-studio__btn sound-studio__btn--primary" onClick={()=>analyze(vision)}><WandSparkles size={15}/> {cues.length?'Re-analyze video':'Detect scenes'}</button>
   <button disabled={busy||working} className="sound-studio__btn" onClick={()=>analyze(false)}>Prompt-based cues</button>
  </div>
  {studio.stage&&<div className="sound-studio__stage"><span className={working?'sound-studio__pulse':''}/>{studio.stage}</div>}
  {studio.visionNotice&&<p className="sound-studio__fine">{studio.visionNotice}</p>}
  {studio.error&&<div className="sound-studio__warning">{studio.error}</div>}
  {notice&&<div className="sound-studio__warning">{notice}</div>}
  {cues.length>0&&<div className="sound-studio__timeline">
   <div className="sound-studio__section-title"><span><SlidersHorizontal size={16}/> Sound cue timeline</span><small>{duration.toFixed(1)}s video · {cues.length} cues · {picked} sounds</small></div>
   <div className="sound-studio__ruler">
    {[0,1,2,3,4].map(i=><span key={i} style={{left:(i*25)+'%'}}>{(duration*i/4).toFixed(1)}s</span>)}
    {cues.map((c,i)=><div key={c.id} className={'sound-studio__tick '+(c.sourceType==='none'?'sound-studio__tick--empty':'')} style={{left:Math.max(1,Math.min(98,100*c.at/duration))+'%'}} title={c.query+' at '+c.at+'s'}><span>{i+1}</span></div>)}
   </div>
   <div className="sound-studio__cues">
    {cues.map((c,i)=><div key={c.id} className="sound-studio__cue">
     <div className="sound-studio__cue-header"><b>Scene {i+1}</b><small>{c.origin==='vision-inferred'?'Frame-inferred sound':c.origin==='prompt-inferred'?'Prompt-inferred sound':'Manual sound cue'}</small><button className="sound-studio__mini" disabled={!ready||busy} onClick={()=>{setCues(old=>old.filter(x=>x.id!==c.id));setDirty(true)}}>Remove cue</button></div>
     <div className="sound-studio__fields">
      <label>Time (seconds)<input type="number" min="0" max={duration} step=".05" value={c.at} disabled={!ready||busy} onChange={e=>edit(c.id,'at',e.target.value)}/></label>
      <label className="sound-studio__grow">Sound search / description<input maxLength="120" value={c.query} disabled={!ready||busy} onChange={e=>edit(c.id,'query',e.target.value)}/></label>
      <label>Volume<input type="number" min="0" max="1.5" step=".1" value={c.gain} disabled={!ready||busy} onChange={e=>edit(c.id,'gain',e.target.value)}/></label>
     </div>
     <div className="sound-studio__fields">
      <label className="sound-studio__grow">Source<select disabled={!ready||busy} value={c.sourceType} onChange={e=>edit(c.id,'sourceType',e.target.value)}><option value="none">No sound / silence</option><option value="openverse">Openverse · licensed real recording</option><option value="earshot">Earshot · local generated SFX</option></select></label>
      {c.sourceType==='openverse'&&<label className="sound-studio__grow">Recording<select disabled={!ready||busy} value={c.candidateId} onChange={e=>{edit(c.id,'candidateId',e.target.value);edit(c.id,'approved',false)}}><option value="">Choose recording after Search sounds</option>{(c.candidates||[]).map(s=><option key={s.id} value={s.id}>{s.title} — {s.creator} ({s.license})</option>)}</select></label>}
      {c.sourceType==='earshot'&&<label className="sound-studio__grow">Bank preset<select disabled={!ready||busy} value={c.sfxId} onChange={e=>edit(c.id,'sfxId',e.target.value)}><option value="">Choose Earshot effect</option>{bank.map(s=><option key={s} value={s}>{s}</option>)}</select></label>}
     </div>
     {c.sourceType==='openverse'&&(()=>{const s=(c.candidates||[]).find(x=>x.id===c.candidateId);return <div className="sound-studio__license">{s&&<small><a href={s.sourceUrl||s.licenseUrl} target="_blank" rel="noreferrer">Review source and license</a> · {s.license.toUpperCase()} · {s.creator}</small>}<label><input type="checkbox" checked={!!c.approved} disabled={!ready||busy||!s} onChange={e=>edit(c.id,'approved',e.target.checked)}/> I verified the original audio license and will include its credits</label></div>})()}
    </div>)}
   </div>
   <div className="sound-studio__toolbar"><button disabled={!ready||busy||dirty||cues.length>=12} className="sound-studio__btn" onClick={()=>act(async()=>{const x=await call('/api/audio-studio/'+video.id+'/add-cue','POST',{at:duration/2});setStudio(x);setCues(x.cues||[])})}>+ Add sound cue</button>
    <button disabled={!ready||busy} className="sound-studio__btn" onClick={()=>act(save)}><CheckCircle2 size={15}/> Save timeline {dirty?'•':''}</button>
    <button disabled={!ready||busy} className="sound-studio__btn" onClick={match}><Search size={15}/> Find licensed sounds</button>
    <button disabled={!ready||busy} className="sound-studio__btn" onClick={getBank}><AudioLines size={15}/> Browse Earshot bank</button>
    <button disabled={!ready||busy||!picked} className="sound-studio__btn sound-studio__btn--primary" onClick={render}><Sparkles size={15}/> Render synchronized MP4</button>
   </div>
  </div>}
  {working&&<div className="sound-studio__processing"><RefreshCw size={17}/> Working on {studio.stage?.toLowerCase()||'audio'}. Your original MP4 is preserved.</div>}
  <div className="sound-studio__delivery" style={{display:'block',marginTop:14}}>
   <h3>Voice-over Narrator</h3><div className="sound-studio__fields">
 <label>Voice engine<select value={narratorEngine} onChange={e=>setNarratorEngine(e.target.value)}><option value="windows">Windows local voice</option><option value="chatterbox">MoneyPrinterJunior Chatterbox {voiceStatus?.chatterbox?'(online)':'(service required)'}</option></select></label>
 <label>Narration style<select value={narratorStyle} onChange={e=>setNarratorStyle(e.target.value)}>{['documentary','calm','warm','inspirational','emotional','dramatic','sermon'].map(s=><option key={s} value={s}>{s}</option>)}</select></label>
 <label>Speed<select value={narratorSpeed} onChange={e=>setNarratorSpeed(Number(e.target.value))}><option value={.74}>Slow cinematic (0.74×)</option><option value={.9}>Relaxed (0.9×)</option><option value={1}>Normal (1×)</option><option value={1.15}>Fast (1.15×)</option></select></label>
 </div><small>Expressive styles work with Chatterbox; Windows voices use the selected speed but not Chatterbox emotion profiles.</small><p>Give your movie a spoken description using a free local Windows voice. Speech is generated from the script below, not invented from the silent video.</p>
   <textarea aria-label="Narration script" rows={3} style={{width:'100%',padding:10,borderRadius:8}} value={narrationText} placeholder={studio.narrationText||'This video shows '+video.prompt+'.'} onChange={e=>setNarrationText(e.target.value)}/>
   <button className="sound-studio__btn sound-studio__btn--primary" disabled={busy||studio.narrationStatus==='running'} onClick={()=>act(async()=>{await call('/api/audio-studio/'+video.id+'/narrate','POST',{text:narrationText||studio.narrationText||'This video shows '+video.prompt+'.',engine:narratorEngine,style:narratorStyle,speed:narratorSpeed});setStudio(v=>({...v,narrationStatus:'running',narrationStage:'Generating narration'}))})}>Narrate this video</button>
   {studio.narrationStatus==='running'&&<small>{studio.narrationStage||'Creating spoken audio...'}</small>}
   {studio.narrationStatus==='failed'&&<p className="sound-studio__warning">{studio.narrationError}</p>}
   {studio.narrationStatus==='completed'&&<button className="sound-studio__btn" onClick={()=>download('narration-download','theux-narrated-video.mp4')}>Download narrated MP4</button>}
  </div>
  {studio.status==='completed'&&<div className="sound-studio__delivery">
   <div><CheckCircle2 size={22}/><b>Soundtrack is ready</b><small>{studio.mixer||'Sound mixer'} · separate MP4 · original preserved</small></div>
   <div><button className="sound-studio__btn sound-studio__btn--primary" onClick={()=>download('download','theux-studio-with-audio.mp4')}><Download size={15}/> Download video + audio</button><button className="sound-studio__btn" onClick={()=>download('credits','theux-sound-credits.txt')}>Download credits</button></div>
  </div>}
  {studio.soundReviews?.length>0&&<details className="sound-studio__reviews"><summary>Earshot sound-match verification ({studio.soundReviews.length})</summary>{studio.soundReviews.map((x,i)=><pre key={i}>{x.error||x.result}</pre>)}</details>}
  <p className="sound-studio__fine">Video-frame analysis suggests sounds; it cannot detect exact impacts or speech from silent frames. Adjust timestamps before exporting. Openverse hosts and licenses must be reviewed before publication.</p>
 </section>;
}
