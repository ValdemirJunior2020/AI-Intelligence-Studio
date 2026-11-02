import React,{useCallback,useEffect,useState} from 'react';
const dur=[8,15,30,60,120,180,300];
export default function OpuscarStudio({call,onError}){
 const [previewId,setPreviewId]=useState(''),[previewUrl,setPreviewUrl]=useState(''),[status,setStatus]=useState(null),[jobs,setJobs]=useState([]),[prompt,setPrompt]=useState('A glowing futuristic city comes alive as orbiting neon shapes and light trails reveal an inspiring story.'),[model,setModel]=useState(''),[duration,setDuration]=useState(8),[ratio,setRatio]=useState('16:9'),[style,setStyle]=useState('cinematic'),[busy,setBusy]=useState(false),[preview,setPreview]=useState(null);
 const refresh=useCallback(async()=>{const [a,b]=await Promise.allSettled([call('/api/opuscar/status'),call('/api/opuscar/jobs')]);if(a.status==='fulfilled'){setStatus(a.value);setModel(old=>a.value.models.includes(old)?old:(a.value.models.find(m=>/coder|qwen/i.test(m))||a.value.models[0]||''))}if(b.status==='fulfilled')setJobs(b.value)},[call]);
 useEffect(()=>{refresh();const t=setInterval(refresh,3000);return()=>clearInterval(t)},[refresh]);
 useEffect(()=>{if(!previewId)return;let active=true,url='';call('/api/opuscar/'+previewId+'/download','GET',undefined,true).then(blob=>{url=URL.createObjectURL(blob);if(active)setPreviewUrl(url);else URL.revokeObjectURL(url)}).catch(onError);return()=>{active=false;if(url)URL.revokeObjectURL(url)}},[previewId,call]);
 const act=async(fn)=>{setBusy(true);try{await fn();await refresh()}catch(e){onError?.(e)}finally{setBusy(false)}};
 const download=async(j)=>{const blob=await call('/api/opuscar/'+j.id+'/download','GET',undefined,true),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='lemo-'+j.id+'.mp4';a.click();setTimeout(()=>URL.revokeObjectURL(url),3000)};
 return <div className="panel" style={{marginTop:14,border:'1px solid #483266',borderRadius:14,padding:16}}>
  <h3>Lemo-Opuscar — Local Animated Video</h3>
  <p className="hint">Ollama-directed code-style motion graphics. No diffusion model, no paid APIs. The application validates a structured scene plan; only trusted Canvas drawing code runs.</p>
  <div className="field-row"><label>Ollama model<select value={model} onChange={e=>setModel(e.target.value)}>{(status?.models||[]).map(m=><option key={m}>{m}</option>)}</select></label>
  <label>Duration<select value={duration} onChange={e=>setDuration(Number(e.target.value))}>{dur.map(n=><option key={n} value={n}>{n>=60?n/60+' minute'+(n>60?'s':''):n+' seconds'}</option>)}</select></label>
  <label>Aspect<select value={ratio} onChange={e=>setRatio(e.target.value)}>{['16:9','9:16','1:1'].map(x=><option key={x}>{x}</option>)}</select></label>
  <label>Style<select value={style} onChange={e=>setStyle(e.target.value)}>{(status?.supportedStyles||['cinematic','minimal','infographic','cartoon','neon','blueprint']).map(x=><option key={x}>{x}</option>)}</select></label></div>
  <label>Animation prompt<textarea rows={5} value={prompt} onChange={e=>setPrompt(e.target.value)}/></label>
  <p className="hint">Ollama: {status?.ollamaOnline?'Connected':'Offline'} · FFmpeg: {status?.ffmpeg?'Ready':'Missing'} · Chromium: {status?.browser?'Ready':'Missing'} · GPU: {status?.gpuAcceleration||'Not tested'}</p>
  {status?.error&&<p className="error">{status.error}</p>}
  <button className="button primary" disabled={busy||!status?.ollamaOnline||!status?.ffmpeg||!status?.browser||!prompt.trim()||!model} onClick={()=>act(()=>call('/api/opuscar/generate','POST',{prompt,model,duration,ratio,style}))}>{busy?'Working...':'Generate animated video'}</button>
  <p className="hint">This engine produces stylized 2D graphics, not photorealistic animals or scenery. Narration and background music are not yet enabled for this engine.</p>
  {jobs.map(j=><div key={j.id} style={{borderTop:'1px solid #49365c',paddingTop:12,marginTop:12}}>
   <strong>{j.prompt.slice(0,100)}</strong> <small>{j.status} · {j.duration}s · {j.ratio}</small>
   {j.status==='running'&&<><div style={{height:7,background:'#241a36',borderRadius:10,margin:'8px 0'}}><div style={{height:7,width:(j.progress||0)+'%',background:'#b08af8',borderRadius:10}}/></div><small>{j.progress||0}% · {j.stage}</small></>}
   {j.error&&<p className="error">{j.error}</p>}
   <div style={{display:'flex',gap:8,marginTop:8,flexWrap:'wrap'}}>
   {j.status==='running'&&<button className="text-button" onClick={()=>act(()=>call('/api/opuscar/'+j.id+'/stop','POST',{}))}>Stop</button>}
   {['cancelled','failed','interrupted'].includes(j.status)&&<button className="text-button" onClick={()=>act(()=>call('/api/opuscar/'+j.id+'/retry','POST',{}))}>Retry</button>}
   {j.status==='completed'&&<><button className="text-button" onClick={()=>setPreviewId(j.id)}>Preview</button><button className="text-button" onClick={()=>act(()=>download(j))}>Download MP4</button></>}
   </div>
   {previewId===j.id&&previewUrl&&<video controls playsInline src={previewUrl} style={{display:'block',width:'100%',maxHeight:430,marginTop:10,borderRadius:10}}/>}
   <details><summary>Generation logs</summary><pre style={{maxHeight:200,overflow:'auto',whiteSpace:'pre-wrap'}}>{(j.logs||[]).join('\n')}</pre></details>
  </div>)}
 </div>
}
