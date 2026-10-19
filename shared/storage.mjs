import { DIFFICULTIES, MAX_LEVEL, validateSnapshot } from './engine.mjs';
export const STORAGE_KEY='hexa-sort-v6';
const bounded=(v,min,max,fallback=min)=>Number.isFinite(Number(v))?Math.max(min,Math.min(max,Math.floor(Number(v)))):fallback;
export function cleanSave(raw) {
  const out={version:6,difficulty:'normal',muted:false,reduced:false,patterns:false,noTools:false,progress:{},game:null,savedAt:0};
  if(!raw||typeof raw!=='object'||Array.isArray(raw))raw={};
  if(Object.hasOwn(DIFFICULTIES,raw.difficulty))out.difficulty=raw.difficulty;
  for(const k of ['muted','reduced','patterns','noTools'])out[k]=raw[k]===true;
  for(const key of Object.keys(DIFFICULTIES)) {
    const p=raw.progress?.[key];out.progress[key]={unlocked:bounded(p?.unlocked,1,MAX_LEVEL),best:{}};
    if(p?.best&&typeof p.best==='object')for(const [level,b]of Object.entries(p.best).slice(0,MAX_LEVEL)) {
      if(!/^\d{1,3}$/.test(level)||Number(level)<1||Number(level)>MAX_LEVEL||!b||typeof b!=='object')continue;
      out.progress[key].best[level]={score:bounded(b.score,0,1e9),combo:bounded(b.combo,0,20000)};
    }
  }
  if(validateSnapshot(raw.game)&&raw.game.mode!=='duel')out.game=structuredClone(raw.game);
  if(Number.isFinite(raw.savedAt)&&raw.savedAt>0)out.savedAt=raw.savedAt;
  return out;
}
export function readSave(storage) {
  try {
    const text=storage.getItem(STORAGE_KEY);
    if(text&&text.length<1000000)return cleanSave(JSON.parse(text));
  }catch{}
  // Only migrate progression: v5 board saves use different rules. Keep the v5 key untouched.
  try {
    const text=storage.getItem('hexa-sort-v5')||storage.getItem('hexa-sort-v4');
    if(text&&text.length<1000000){const old=JSON.parse(text);return cleanSave({...old,difficulty:old.current,reduced:old.lowFx});}
  }catch{}
  return cleanSave(null);
}
export function writeSave(storage,value){try{storage.setItem(STORAGE_KEY,JSON.stringify(value));return true;}catch{return false;}}
