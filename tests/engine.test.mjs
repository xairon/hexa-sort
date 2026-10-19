import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, applyAction, advanceTime, validateSnapshot, neighbors, topRun, boardFor } from '../shared/engine.mjs';
import { cleanSave, readSave } from '../shared/storage.mjs';
const clone=structuredClone;
const tokens=s=>s.cells.reduce((n,c)=>n+c.stack.length,0)+s.dock.reduce((n,d)=>n+(d?.length||0),0);
test('axial geometry: correct sizes and symmetric adjacency',()=>{
  for(const [radius,count]of [[2,19],[3,37],[4,61]]){const s={cells:boardFor(radius)};assert.equal(s.cells.length,count);s.cells.forEach((_,i)=>{for(const j of neighbors(s,i))assert.ok(neighbors(s,j).includes(i));});}
});
test('same seed + legal actions produces identical independent games; inputs are immutable',()=>{
  let a=createGame({seed:123,mode:'duel'}),b=clone(a);
  for(let k=0;k<40&&a.status==='playing';k++){
    const action={type:'place',cell:a.cells.findIndex(c=>!c.rock&&!c.stack.length),slot:a.dock.findIndex(Boolean)};
    const before=clone(a);a=applyAction(a,action).state;b=applyAction(b,action).state;
    assert.deepEqual(a,b);assert.notDeepEqual(a,before);assert.ok(validateSnapshot(a));
    for(let i=0;i<a.cells.length;i++)if(a.cells[i].stack.length){assert.ok(topRun(a.cells[i].stack)<10);for(const j of neighbors(a,i))if(a.cells[j].stack.length)assert.notEqual(a.cells[i].stack.at(-1),a.cells[j].stack.at(-1));}
  }
});
test('bridge group collects across a connected component and conserves remaining tokens',()=>{
  const s=createGame({seed:1});for(const c of s.cells){c.stack=[];c.rock=0;}
  const i=s.cells.findIndex(c=>c.q===0&&c.r===0),[a,b]=neighbors(s,i);
  s.cells[a].stack=Array(4).fill(0);s.cells[b].stack=Array(4).fill(0);s.dock=[[0,0],null,null];
  const result=applyAction(s,{type:'place',slot:0,cell:i});
  assert.ok(result.state.score>=100);assert.equal(result.events.filter(e=>e.type==='collect').reduce((n,e)=>n+e.count,0),10);
  assert.equal(s.cells[a].stack.length,4);assert.ok(result.state.cells.every(c=>!c.stack.length));
});
test('actual chrono elapsed time is not capped, including expiry before hammer',()=>{
  let s=createGame({mode:'chrono',seed:3});s=advanceTime(s,1000);assert.equal(s.timeLeft,89000);
  s.timeLeft=10;s=advanceTime(s,50);assert.equal(s.status,'over');assert.equal(s.reason,'time');
  assert.throws(()=>applyAction(s,{type:'hammer',cell:0}),/terminée/);
});
test('hammer is atomic; no delayed job can revive an expired chrono',()=>{
  let s=createGame({mode:'chrono',seed:3});const i=s.cells.findIndex(c=>c.stack.length);
  s=applyAction(s,{type:'hammer',cell:i}).state;assert.equal(s.hammers,0);assert.equal(s.cells[i].stack.length,0);
  s=advanceTime(s,90001);assert.equal(s.status,'over');
});
test('validation rejects prototype keys, nonfinite values and oversized stacks',()=>{
  assert.throws(()=>createGame({difficulty:'toString'}));
  for(const mutation of [s=>s.level=Infinity,s=>s.score=NaN,s=>s.cells[0].stack=Array(100000).fill(0),s=>s.difficulty='constructor',s=>s.rng=-1,s=>s.cells[0].q=999]){const s=createGame();mutation(s);assert.equal(validateSnapshot(s),false);}
  const out=cleanSave({difficulty:'toString',progress:{normal:{unlocked:'Infinity'},easy:{unlocked:1000000}}});
  assert.equal(out.difficulty,'normal');assert.equal(out.progress.normal.unlocked,1);assert.equal(out.progress.easy.unlocked,500);
});
test('v5 migration retains progression without altering old saves or trusting v5 boards',()=>{
  const legacy=JSON.stringify({current:'expert',progress:{expert:{unlocked:500,best:{1:{score:1000,combo:7}},game:{invalid:true}}}});
  const storage={getItem:k=>k==='hexa-sort-v5'?legacy:null};const s=readSave(storage);
  assert.equal(s.difficulty,'expert');assert.equal(s.progress.expert.unlocked,500);assert.equal(s.progress.expert.best[1].combo,7);assert.equal(s.game,null);
});
test('invalid action cannot alter state; ranked tools unavailable',()=>{
  const s=createGame({mode:'duel',seed:2}),before=clone(s);
  for(const a of [{type:'place',slot:0,cell:-1},{type:'place',slot:NaN,cell:1},{type:'hammer',cell:0},{type:'reroll'},{type:'score',score:999999}])assert.throws(()=>applyAction(s,a));
  assert.deepEqual(s,before);
});
test('simulation across modes/seeds terminates, validates and never creates negative tools',()=>{
  for(const mode of ['levels','moves','daily','survival','chrono','duel'])for(let seed=1;seed<=20;seed++){
    let s=createGame({mode,seed});assert.ok(validateSnapshot(s));
    for(let k=0;k<100&&s.status==='playing';k++){
      const free=s.cells.findIndex(c=>!c.stack.length&&!c.rock);
      const action=free>=0?{type:'place',cell:free,slot:s.dock.findIndex(Boolean)}:{type:'hammer',cell:s.cells.findIndex(c=>c.stack.length||c.rock)};
      s=applyAction(s,action).state;assert.ok(validateSnapshot(s),`${mode} ${seed} ${k}`);assert.ok(s.hammers>=0);
    }
  }
});
