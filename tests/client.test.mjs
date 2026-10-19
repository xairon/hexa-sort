// DOM integration without a browser binary. Canvas calls are stubbed; no visual QA is claimed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { createServer } from '../server/main.mjs';

test('client boot, solo moves, mode changes, room join, forfeit and ladder DOM',async t=>{
  const {server}=createServer({database:':memory:'});server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(()=>new Promise(r=>server.close(r)));const origin='http://127.0.0.1:'+server.address().port;
  const originalFetch=globalThis.fetch;let cookie='';
  const intervals=[];const originalInterval=globalThis.setInterval;
  globalThis.setInterval=(fn,ms)=>{const timer=originalInterval(fn,ms);intervals.push(timer);return timer;};
  t.after(()=>{for(const timer of intervals)clearInterval(timer);globalThis.fetch=originalFetch;globalThis.setInterval=originalInterval;});
  globalThis.fetch=async(url,options={})=>{const path=String(url).split('/api/')[1];const res=await originalFetch(origin+'/api/'+path,{...options,headers:{...options.headers,Origin:origin,Cookie:cookie}});if(res.headers.get('set-cookie'))cookie=res.headers.get('set-cookie').split(';')[0];return res;};
  const elements=new Map(),noop=()=>{};
  const ctx=new Proxy({},{get:()=>noop});
  class Element {
    constructor(id=''){this.id=id;this.value='';this.checked=false;this.hidden=false;this.disabled=false;this.dataset={};this.children=[];this.style={};this.listeners={};this.attrs={};this.textContent='';this.classList={toggle:noop,add:noop,remove:noop};}
    addEventListener(n,fn){(this.listeners[n]??=[]).push(fn);}async emit(n,e={}){for(const fn of this.listeners[n]||[])await fn({preventDefault:noop,...e});}
    append(...els){this.children.push(...els);}replaceChildren(...els){this.children=[...els];}setAttribute(n,v){this.attrs[n]=v;}removeAttribute(n){delete this.attrs[n];}
    focus(){document.activeElement=this;}getContext(){return ctx;}getBoundingClientRect(){return{left:0,top:0,width:700,height:535};}setPointerCapture(){}showModal(){this.open=true;}close(){this.open=false;}
  }
  const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
  for(const m of html.matchAll(/id="([^"]+)"/g))elements.set(m[1],new Element(m[1]));
  const tabs=['play','arena','ladder'].map(name=>{const e=new Element();e.dataset.tab=name;return e;});
  const el=id=>elements.get(id);
  el('mode').value='levels';el('difficulty').value='normal';el('level').value='1';
  const data=new Map();globalThis.localStorage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)};
  globalThis.document={getElementById:el,querySelectorAll:q=>q==='.panel'?['play','arena','ladder'].map(el):tabs,createElement:()=>new Element(),activeElement:null,addEventListener:noop,hidden:false};
  globalThis.window={addEventListener:noop};globalThis.devicePixelRatio=1;globalThis.matchMedia=()=>({matches:false});let frame;
  globalThis.requestAnimationFrame=fn=>frame=fn;globalThis.confirm=()=>true;
  Object.defineProperty(globalThis,'navigator',{value:{},configurable:true});
  async function until(fn){for(let i=0;i<200;i++){if(fn())return;await delay(10);}throw Error('DOM condition timed out');}
  await import('../app.mjs');await until(()=>el('connection').textContent==='Arena connectée');
  assert.equal(el('score').textContent,'0');assert.ok(el('accessibleBoard').children.length===37);frame(performance.now());
  await el('board').emit('keydown',{key:'1'});const target=el('accessibleBoard').children.find(b=>b.textContent.endsWith('libre'));assert.ok(target);target.onclick();
  assert.equal(JSON.parse(data.get('hexa-sort-v6')).game.turn,1);
  el('difficulty').value='expert';await el('difficulty').emit('change');await el('newGame').emit('click');assert.equal(el('accessibleBoard').children.length,19);
  await el('board').emit('keydown',{key:'ArrowRight'});frame(performance.now());
  await el('createRoom').emit('click');const code=el('roomCode').value;assert.match(code,/^[A-F0-9]{8}$/);
  let otherCookie='';async function other(path,body){const res=await originalFetch(origin+'/api/'+path,{method:body===undefined?'GET':'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:otherCookie},body:body===undefined?undefined:JSON.stringify(body)});if(res.headers.get('set-cookie'))otherCookie=res.headers.get('set-cookie').split(';')[0];return res.json();}
  await other('me');await other('rooms/'+code+'/join',{});await until(()=>!el('openMatch').hidden);await el('openMatch').emit('click');
  assert.match(el('gameLabel').textContent,/Duel classé/);await el('resign').emit('click');assert.match(el('roomDetail').textContent,/Défaite/);
  await el('refreshLadder').emit('click');assert.equal(el('eloRows').children.length,2);
  await el('rankedDaily').emit('click');assert.match(el('gameLabel').textContent,/CLASSÉ/);
  for(const timer of intervals)clearInterval(timer);
});
