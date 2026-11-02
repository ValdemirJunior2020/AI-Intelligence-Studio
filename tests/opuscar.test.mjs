import test from 'node:test';import assert from 'node:assert/strict';import {validateAnimationPlan,animationFrameSource} from '../server/opuscar.mjs';
const safe={scenes:[{title:'Orbiting lights',description:'Purple lights circle above the horizon',motion:'orbit',objects:[{type:'circle',x:.5,y:.45,size:.1,color:'#aabbcc'}]}]};
test('bounded data-only animation plan',()=>{
 const p=validateAnimationPlan(safe,{duration:12,style:'cinematic'});assert.equal(p.scenes[0].title,'Orbiting lights');assert.equal(p.duration,12);
 assert.equal(p.scenes[0].objects[0].color,'#aabbcc');assert.ok(animationFrameSource().includes('window.drawFrame'));
});
test('reject script instructions instead of executing generated code',()=>{
 assert.throws(()=>validateAnimationPlan({scenes:[{title:'test',description:'run script using eval()'}]}),/unsafe/);
 assert.throws(()=>validateAnimationPlan({scenes:[]}),/1–24/);
});
test('clamp positions, size and duration',()=>{
 const p=validateAnimationPlan({scenes:[{title:'Safe',description:'Animated star',objects:[{type:'star',x:3,y:-2,size:99,color:'bad'}]}]},{duration:400});
 assert.equal(p.duration,300);assert.equal(p.scenes[0].objects[0].x,1);assert.equal(p.scenes[0].objects[0].y,0);assert.equal(p.scenes[0].objects[0].size,.45);
});
