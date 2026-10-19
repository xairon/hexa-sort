import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
const code=await readFile(new URL('../sw.js',import.meta.url),'utf8');
function setup(response){
  const listeners={},puts=[],waits=[];const cached=new Response('working game',{headers:{'Content-Type':'text/html'}});
  const cache={match:async()=>cached,put:async(...args)=>puts.push(args),addAll:async()=>{}};
  const self={registration:{scope:'https://example.com/hexa-sort/'},addEventListener:(n,fn)=>listeners[n]=fn,clients:{claim:async()=>{}}};
  vm.runInNewContext(code,{self,caches:{open:async()=>cache},fetch:async()=>response,URL,Response,Set,Promise});
  async function get(path){let promised;listeners.fetch({request:{method:'GET',url:'https://example.com/hexa-sort/'+path,mode:'navigate'},respondWith:p=>promised=p,waitUntil:p=>waits.push(p)});return promised?await promised:null;}
  return{get,puts,waits};
}
test('HTTP 404 cannot replace the working offline shell',async()=>{const s=setup(new Response('404',{status:404}));assert.equal(await(await s.get('')).text(),'working game');assert.equal(s.puts.length,0);});
test('HTML cache writes extend the service worker lifetime',async()=>{const s=setup(new Response('new game',{headers:{'Content-Type':'text/html'}}));assert.equal(await(await s.get('')).text(),'new game');assert.equal(s.puts.length,1);assert.equal(s.waits.length,1);});
test('API routes are never intercepted or cached',async()=>{const s=setup(new Response('{}'));assert.equal(await s.get('api/me'),null);assert.equal(s.puts.length,0);});
