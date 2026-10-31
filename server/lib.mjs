import crypto from 'node:crypto';
export function clean(v,max=10000){return String(v??'').trim().slice(0,max)}
export function safeName(s){return clean(s,100).replace(/[^a-z0-9 _.-]/gi,'').replace(/\.\./g,'').trim()||'Untitled'}
export function snippets(docs,query,limit=5){
 const terms=[...new Set(clean(query,400).toLowerCase().match(/[a-z0-9]{3,}/g)||[])].filter(x=>!['the','and','for','you','with','what','how','this','that'].includes(x));
 return docs.flatMap(d=>{const text=clean(d.text||'',80000);const parts=text.match(/[\s\S]{1,900}/g)||[];return parts.map((p,i)=>({title:d.name||'Document',chunk:i,text:p,score:terms.reduce((sum,t)=>sum+(p.toLowerCase().split(t).length-1),0)}));}).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,limit);
}
export function passwordHash(p){const salt=crypto.randomBytes(16).toString('hex');return salt+':'+crypto.scryptSync(p,salt,64).toString('hex')}
export function passwordVerify(p,hash){if(typeof hash!=='string'||!hash.includes(':'))return false;const [salt,expected]=hash.split(':');const a=crypto.scryptSync(p,salt,64);const b=Buffer.from(expected,'hex');return b.length===a.length&&crypto.timingSafeEqual(a,b)}
export function noSecretUrl(url){return /^https:\/\/[a-z0-9.-]+(?::\d+)?(\/.*)?$/i.test(url)}
