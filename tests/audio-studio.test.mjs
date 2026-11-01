import test from 'node:test';
import assert from 'node:assert/strict';
import {starterCues,validateCues} from '../server/audio-studio.mjs';
test('prompt inference is labeled and bounded',()=>{
 const c=starterCues('a dog barking',2.1);
 assert.equal(c.length,1);assert.equal(c[0].origin,'prompt-inferred');assert.match(c[0].query,/dog barking/);
});
test('refuses unlisted Openverse IDs and clamps time and gain',()=>{
 const prev=[{id:'cue1',query:'rain',candidates:[{id:'allow'}]}];
 assert.throws(()=>validateCues([{id:'cue1',sourceType:'openverse',candidateId:'unknown'}],prev,3),/Choose an Openverse/);
 const v=validateCues([{id:'cue1',at:20,query:'rain',gain:100,sourceType:'openverse',candidateId:'allow',approved:true}],prev,3);
 assert.equal(v[0].at,2.95);assert.equal(v[0].gain,1.5);assert.equal(v[0].approved,true);
});
test('Earshot preset survives validation and foreign cue IDs fail',()=>{
 assert.throws(()=>validateCues([{id:'missing'}],[],3),/Cue not found/);
 const v=validateCues([{id:'a',sourceType:'earshot',sfxId:'whoosh_fast/crisp',at:0.3}], [{id:'a'}],2);
 assert.equal(v[0].sfxId,'whoosh_fast/crisp');
});
