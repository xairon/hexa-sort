// Same rules run in the browser and on the server. No DOM, timers, or Math.random.
export const ENGINE_VERSION = 1;
export const MAX_LEVEL = 500;
export const DIFFICULTIES = Object.freeze({
  easy: { radius: 4, colors: 4, fill: .45, tools: 5 },
  normal: { radius: 3, colors: 6, fill: .6, tools: 3 },
  hard: { radius: 3, colors: 6, fill: .7, tools: 1 },
  expert: { radius: 2, colors: 5, fill: .6, tools: 1 },
});
export const MODES = ['levels', 'moves', 'survival', 'chrono', 'daily', 'duel'];
const DIRS = [[1,0],[1,-1],[0,-1],[-1,0],[-1,1],[0,1]];
const own = (obj, key) => Object.hasOwn(obj, key);
const int = (v, min, max) => Number.isSafeInteger(v) && v >= min && v <= max;
export function hashSeed(text) {
  let n = 2166136261;
  for (const c of String(text)) n = Math.imul(n ^ c.charCodeAt(0), 16777619);
  return n >>> 0;
}
export function utcDay(time = Date.now()) { return new Date(time).toISOString().slice(0,10); }
export function topRun(s) {
  let n = 0;
  for (let i = s.length - 1; i >= 0 && s[i] === s.at(-1); i--) n++;
  return n;
}
export function boardFor(radius) {
  const cells = [];
  for (let q = -radius; q <= radius; q++)
    for (let r = Math.max(-radius, -q-radius); r <= Math.min(radius, -q+radius); r++)
      cells.push({ q, r, stack: [], rock: 0 });
  return cells;
}
export function createGame({ seed = 1, mode = 'levels', difficulty = 'normal', level = 1, day = utcDay(), noTools = false } = {}) {
  if (!MODES.includes(mode) || !own(DIFFICULTIES, difficulty) || !int(level,1,MAX_LEVEL) || !int(seed,0,0xffffffff)) throw Error('Configuration invalide');
  const cfg = DIFFICULTIES[difficulty];
  const special = mode !== 'levels';
  const ranked = mode === 'duel' || mode === 'daily';
  const s = {
    version: ENGINE_VERSION, seed, rng: seed, mode, difficulty, level, day,
    radius: special ? 3 : cfg.radius,
    cells: boardFor(special ? 3 : cfg.radius), dock: [null,null,null],
    score: 0, turn: 0, combo: 0, bestCombo: 0, fever: 0,
    movesLeft: ({moves:30,daily:25,duel:40})[mode] ?? null,
    timeLeft: mode === 'chrono' ? 90000 : null,
    hammers: ranked || noTools ? 0 : special ? (mode === 'survival' ? 2 : 1) : cfg.tools,
    rerolls: ranked || noTools ? 0 : special ? (mode === 'survival' ? 2 : 1) : cfg.tools,
    nextRock: 8, status: 'playing', reason: null,
    goal: mode === 'levels' ? Math.round(Math.min(10000, level<=10 ? 800+(level-1)*600 : 6200+(level-10)*100) * (difficulty === 'expert' ? .5 : 1) / 50)*50 : null,
  };
  // Keep the daily seed independent from a player's previous difficulty/settings.
  const fill = special ? mode === 'survival' ? .4 : .5 : cfg.fill;
  const weighted = s.cells.map((c,i)=>({ i, w: -c.r-c.q/2+Math.abs(c.q)*.4+random(s)*.7 })).sort((a,b)=>b.w-a.w);
  let count = 0;
  for (const {i} of weighted) {
    if (count >= Math.round(s.cells.length*fill)) break;
    if (s.cells[i].q===0 && s.cells[i].r===0) continue;
    const avoid = neighbors(s,i).map(j=>s.cells[j].stack.at(-1));
    const allowed = Array.from({length:colors(s)},(_,c)=>c).filter(c=>!avoid.includes(c));
    if (!allowed.length) continue;
    const st = makeStack(s); st[st.length-1]=pick(s,allowed);
    s.cells[i].stack=st; count++;
  }
  refill(s);
  return s;
}
function random(s) {
  s.rng = (s.rng + 0x6D2B79F5) >>> 0;
  let t = Math.imul(s.rng ^ (s.rng >>> 15), 1 | s.rng);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = (s,a) => a[Math.floor(random(s)*a.length)];
function colors(s) {
  if (s.mode==='survival') return Math.min(6,4+Math.floor(s.turn/12));
  if (s.mode!=='levels') return 5;
  return s.difficulty==='normal' ? Math.min(6,3+s.level) : DIFFICULTIES[s.difficulty].colors;
}
function makeStack(s) {
  const n=2+Math.floor(random(s)*6), out=[];
  let run=0, c=-1;
  for(let i=0;i<n;i++) {
    const next=Math.floor(random(s)*colors(s));
    if (next===c && run>=3) {c=(c+1+Math.floor(random(s)*(colors(s)-1)))%colors(s);run=1;}
    else {run=next===c ? run+1 : 1;c=next;}
    out.push(c);
  }
  return out;
}
function refill(s) {
  const count=s.movesLeft===null ? 3 : Math.min(3,s.movesLeft);
  s.dock=Array.from({length:3},(_,i)=>i<count?makeStack(s):null);
}
export function neighbors(s,i) {
  const c=s.cells[i];
  return DIRS.map(([q,r])=>s.cells.findIndex(n=>n.q===c.q+q && n.r===c.r+r)).filter(i=>i>=0);
}
function groupFor(s,start) {
  const color=s.cells[start].stack.at(-1), group=[start];
  for(let k=0;k<group.length;k++) for(const n of neighbors(s,group[k]))
    if(!s.cells[n].rock && s.cells[n].stack.length && s.cells[n].stack.at(-1)===color && !group.includes(n)) group.push(n);
  return group;
}
function resolve(s, events, feverOn) {
  let combo=0;
  // Every transfer empties at least one top layer; every collection removes tokens.
  // A defensive guard fails the action rather than committing an unstable board.
  for(let guard=0;guard<20000;guard++) {
    let changed=false;
    for(let i=0;i<s.cells.length;i++) {
      if(!s.cells[i].stack.length || s.cells[i].rock) continue;
      const group=groupFor(s,i);
      let target=i;
      if(group.length>1) {
        target=group.reduce((best,j)=> {
          const weight=k=>neighbors(s,k).filter(n=>group.includes(n)).length*100+(topRun(s.cells[k].stack)===s.cells[k].stack.length?10:0)+(k===i?5:0);
          return weight(j)>weight(best)?j:best;
        },i);
        const color=s.cells[i].stack.at(-1);
        // Aggregate in one logical step; the view may animate it independently.
        for(const j of group) if(j!==target) {
          const n=topRun(s.cells[j].stack);
          s.cells[j].stack.splice(-n,n);
          s.cells[target].stack.push(...Array(n).fill(color));
          events.push({type:'transfer',from:j,to:target,count:n,color});combo++;changed=true;
        }
      }
      const cell=s.cells[target], n=topRun(cell.stack);
      if(n>=10) {
        combo++;
        const mult=Math.min(10,1+Math.floor((combo-1)/2));
        if(combo>=5 && !feverOn) {s.fever=3;feverOn=true;}
        const points=n*10*mult*(feverOn?2:1);
        cell.stack.splice(-n,n);s.score+=points;
        if(s.mode==='chrono') s.timeLeft+=3000;
        for(const j of neighbors(s,target)) if(s.cells[j].rock) {
          if(--s.cells[j].rock===0) {s.score+=50;events.push({type:'rock-break',cell:j});}
        }
        events.push({type:'collect',cell:target,count:n,points});changed=true;
      }
    }
    if(!changed) {s.combo=combo;s.bestCombo=Math.max(s.bestCombo,combo);return;}
  }
  throw Error('Résolution instable');
}
function end(s,reason) {s.status=reason==='goal'?'won':'over';s.reason=reason;}
function checkEnd(s) {
  if(s.mode==='levels' && s.score>=s.goal) return end(s,'goal');
  if(s.movesLeft!==null && s.movesLeft<=0) return end(s,'moves');
  if(s.timeLeft!==null && s.timeLeft<=0) return end(s,'time');
  if(!s.cells.some(c=>!c.rock && !c.stack.length) && s.hammers===0) end(s,'full');
}
export function applyAction(original, action) {
  if(!action || original.status!=='playing') throw Error('Partie terminée ou action invalide');
  const s=structuredClone(original),events=[];
  if(action.type==='place') {
    if(!int(action.slot,0,2) || !int(action.cell,0,s.cells.length-1)) throw Error('Case invalide');
    const c=s.cells[action.cell], pile=s.dock[action.slot];
    if(!pile || c.rock || c.stack.length) throw Error('Placement impossible');
    c.stack=pile.slice();s.dock[action.slot]=null;s.turn++;
    if(s.movesLeft!==null)s.movesLeft--;
    const feverOn=s.fever>0;if(feverOn)s.fever--;
    events.push({type:'place',cell:action.cell});
    resolve(s,events,feverOn);
    if(s.mode==='survival' && s.turn>=s.nextRock) {
      const n=s.turn>=300?3:s.turn>=150?2:1;
      for(let k=0;k<n;k++) {
        const free=s.cells.map((c,i)=>({c,i})).filter(({c})=>!c.rock&&!c.stack.length);
        if(!free.length)break;
        const ring=c=>Math.max(Math.abs(c.q),Math.abs(c.r),Math.abs(c.q+c.r));
        const max=Math.max(...free.map(({c})=>ring(c)));
        const {i}=pick(s,free.filter(({c})=>ring(c)===max));
        s.cells[i].rock=s.turn>=100?2:1;events.push({type:'rock',cell:i});
      }
      s.nextRock=s.turn+Math.max(2,8-Math.floor(s.turn/20));
    }
    if(s.dock.every(x=>x===null))refill(s);
  } else if(action.type==='hammer') {
    if(s.hammers<=0 || !int(action.cell,0,s.cells.length-1))throw Error('Marteau indisponible');
    const c=s.cells[action.cell];if(!c.stack.length&&!c.rock)throw Error('Case vide');
    s.hammers--;c.stack=[];c.rock=0;events.push({type:'hammer',cell:action.cell});
  } else if(action.type==='reroll') {
    if(s.rerolls<=0)throw Error('Relance indisponible');
    s.rerolls--;refill(s);events.push({type:'reroll'});
  } else throw Error('Action inconnue');
  checkEnd(s);
  return {state:s,events};
}
// Actual elapsed milliseconds, never capped to the animation frame duration.
export function advanceTime(original, ms) {
  if(!Number.isFinite(ms)||ms<0)throw Error('Durée invalide');
  if(original.mode!=='chrono'||original.status!=='playing')return original;
  const s=structuredClone(original);s.timeLeft=Math.max(0,s.timeLeft-ms);checkEnd(s);return s;
}
export function validateSnapshot(s) {
  try {
    if(!s||s.version!==ENGINE_VERSION||!MODES.includes(s.mode)||!own(DIFFICULTIES,s.difficulty))return false;
    if(!int(s.seed,0,0xffffffff)||!int(s.rng,0,0xffffffff)||!int(s.level,1,MAX_LEVEL))return false;
    if(typeof s.day!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s.day))return false;
    const radius=s.mode==='levels'?DIFFICULTIES[s.difficulty].radius:3;
    if(s.radius!==radius||!Array.isArray(s.cells)||s.cells.length!==boardFor(radius).length)return false;
    const expected=boardFor(radius);let total=0;
    const pile=p=>Array.isArray(p)&&p.length<=512&&p.every(c=>int(c,0,5));
    for(let i=0;i<s.cells.length;i++) {
      const c=s.cells[i];if(c.q!==expected[i].q||c.r!==expected[i].r||!int(c.rock,0,2)||!pile(c.stack)||(c.rock&&c.stack.length))return false;
      total+=c.stack.length;
    }
    if(total>4096||!Array.isArray(s.dock)||s.dock.length!==3||!s.dock.every(p=>p===null||(pile(p)&&p.length>=2&&p.length<=7)))return false;
    for(const k of ['score','turn','combo','bestCombo','fever','hammers','rerolls','nextRock'])if(!int(s[k],0,k==='score'?1000000000:k==='turn'||k==='nextRock'?10000000:k==='combo'||k==='bestCombo'?20000:9))return false;
    if(!['playing','won','over'].includes(s.status)||!(s.reason===null||['goal','full','moves','time'].includes(s.reason)))return false;
    const maxMoves=({moves:30,daily:25,duel:40})[s.mode];
    if(maxMoves!==undefined?!int(s.movesLeft,0,maxMoves):s.movesLeft!==null)return false;
    if(s.mode==='chrono'?!(Number.isFinite(s.timeLeft)&&s.timeLeft>=0&&s.timeLeft<=86400000):s.timeLeft!==null)return false;
    if(s.mode==='levels'?!int(s.goal,100,10000):s.goal!==null)return false;
    return true;
  }catch{return false;}
}
