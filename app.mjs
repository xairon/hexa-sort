import { createGame, applyAction, advanceTime, hashSeed, utcDay, DIFFICULTIES, MAX_LEVEL, topRun } from './shared/engine.mjs';
import { readSave, writeSave } from './shared/storage.mjs';
const $=id=>document.getElementById(id);
const COLORS=['#5faff0','#7bd6ac','#f2a460','#b9a1ee','#efd274','#f17e87'];
const SYMBOLS=['●','◆','▲','✚','★','■'];
const NAMES=['bleu','vert','orange','violet','jaune','rouge'];
const LABELS={levels:'Parcours',survival:'Survie',moves:'Coups comptés',chrono:'Chrono',daily:'Défi du jour',duel:'Duel classé'};
const DIFF_LABELS={easy:'Facile',normal:'Normal',hard:'Difficile',expert:'Expert'};
const fmt=new Intl.NumberFormat('fr-FR');
const local=readSave(localStorage);
let game=local.game,selected=-1,hammer=false,history=[],remote=null,room=null,me=null,busy=false,activeTab='play';
let lastTick=Date.now(),effect=null,drag=null,hover=-1,cursor=0,toastTimer=null,audio=null,connectionReady=false;
let pollBusy=false,epoch=0,lastPollError=0;
const board=$('board'),ctx=board.getContext('2d');
let w=600,h=535,unit=35,centers=[],dockCenters=[];
function toast(text){$('toast').textContent=text;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),4500);}
function saveLocal(){if(!remote){local.game=game;local.savedAt=Date.now();}if(!writeSave(localStorage,local))toast('Sauvegarde indisponible : le stockage du navigateur est plein ou désactivé.');}
function settleTime(){const now=Date.now();if(game&&!remote){const before=game.status;game=advanceTime(game,Math.max(0,now-lastTick));if(before!==game.status)changed();}lastTick=now;}
function setTab(name){if(!['play','arena','ladder'].includes(name))return;activeTab=name;for(const el of document.querySelectorAll('.panel'))el.hidden=el.id!==name;for(const el of document.querySelectorAll('[data-tab]')){if(el.dataset.tab===name)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current');}if(name==='play')resize();if(name==='ladder')refreshLadder();if(name==='arena')refreshRooms();}
for(const el of document.querySelectorAll('[data-tab]'))el.addEventListener('click',()=>setTab(el.dataset.tab));
function syncSetup(){const d=$('difficulty').value;local.difficulty=d;const unlocked=local.progress[d].unlocked;$('level').max=unlocked;$('level').value=Math.min(unlocked,Math.max(1,Number($('level').value)||1));$('unlocked').textContent=`/ ${unlocked} débloqués`;$('difficulty').disabled=$('mode').value!=='levels';$('level').disabled=$('mode').value!=='levels';}
$('difficulty').value=local.difficulty;
for(const k of ['patterns','reduced','muted','noTools']){$(k).checked=local[k];$(k).addEventListener('change',()=>{local[k]=$(k).checked;saveLocal();renderAccessible();});}
if(matchMedia('(prefers-reduced-motion: reduce)').matches){local.reduced=true;$('reduced').checked=true;}
$('difficulty').addEventListener('change',syncSetup);$('mode').addEventListener('change',syncSetup);syncSetup();
function freshSolo(){
  if(room&&['playing','waiting'].includes(room.status)){toast('Termine ou abandonne ton duel avant de lancer une autre partie.');setTab('arena');return;}
  epoch++;drag=null;hover=-1;remote=null;selected=-1;hammer=false;history=[];cursor=0;
  const mode=$('mode').value,difficulty=$('difficulty').value;
  const level=Math.min(local.progress[difficulty].unlocked,Math.max(1,Math.min(MAX_LEVEL,Math.floor(Number($('level').value)||1))));
  const seed=mode==='daily'?hashSeed('hexa-v6-'+utcDay()):crypto.getRandomValues(new Uint32Array(1))[0];
  game=createGame({mode,difficulty:mode==='levels'?difficulty:'normal',level:mode==='levels'?level:1,seed,noTools:local.noTools});
  lastTick=Date.now();changed();setTab('play');resize();
}
$('newGame').addEventListener('click',freshSolo);
$('restart').addEventListener('click',()=>{if(remote){toast('Le défi classé et les duels ne se recommencent pas.');return;}freshSolo();});
$('resume').addEventListener('click',()=>{if(room&&['waiting','playing'].includes(room.status)){toast('Termine ou abandonne ton duel avant de reprendre le solo.');return;}if(!local.game)return;const elapsed=Math.max(0,Date.now()-local.savedAt);epoch++;remote=null;game=advanceTime(structuredClone(local.game),elapsed);selected=-1;hammer=false;drag=null;cursor=0;history=[];lastTick=Date.now();changed();setTab('play');});
function sound(collect=false){if(local.muted)return;try{const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;audio??=new AC();audio.resume().catch(()=>{});const o=audio.createOscillator(),g=audio.createGain(),now=audio.currentTime;o.type='sine';o.frequency.setValueAtTime(collect?720:330,now);o.frequency.exponentialRampToValueAtTime(collect?1100:220,now+.12);g.gain.setValueAtTime(.07,now);g.gain.exponentialRampToValueAtTime(.001,now+.16);o.connect(g).connect(audio.destination);o.start();o.stop(now+.17);}catch{}}
function changed(events=[]){
  if(!game)return;
  if(game.status==='won'&&!remote&&game.mode==='levels'){
    const p=local.progress[game.difficulty];p.unlocked=Math.max(p.unlocked,Math.min(MAX_LEVEL,game.level+1));
    const old=p.best[game.level];p.best[game.level]={score:Math.max(old?.score||0,game.score),combo:Math.max(old?.combo||0,game.bestCombo)};
    syncSetup();
  }
  if(events.length){effect={events,at:performance.now()};sound(events.some(e=>e.type==='collect'));}
  saveLocal();updateHud();renderAccessible();
}
function canPlay(){if(game?.mode==='daily'&&!remote&&game.day!==utcDay())return false;return game&&game.status==='playing'&&!busy&&(!remote||remote.kind!=='room'||room?.status==='playing'&&!room.forfeits.includes(me?.id));}
function updateHud(){
  if(!game)return;
  $('score').textContent=fmt.format(game.score);
  $('gameLabel').textContent=`${LABELS[game.mode]}${game.mode==='levels'?' / '+DIFF_LABELS[game.difficulty]:remote?' / CLASSÉ':' / SOLO'}`;
  $('goal').textContent=game.goal?`Objectif ${fmt.format(game.goal)}`:`Meilleur combo ×${game.bestCombo}`;
  $('counterLabel').textContent=game.mode==='chrono'?'SECONDES':game.movesLeft!==null?'PILES RESTANTES':game.mode==='survival'?'PILES POSÉES':'NIVEAU';
  $('counter').textContent=game.mode==='chrono'?Math.ceil(game.timeLeft/1000):game.movesLeft??(game.mode==='survival'?game.turn:game.level);
  $('combo').textContent=game.fever?'FIÈVRE ×2':game.combo>=2?`Combo ×${game.combo}`:'À toi de jouer';
  $('hammerCount').textContent=game.hammers;$('rerollCount').textContent=game.rerolls;
  $('hammer').disabled=!canPlay()||game.hammers<=0;$('reroll').disabled=!canPlay()||game.rerolls<=0;
  $('hammer').classList.toggle('active',hammer);
  $('undo').disabled=!!remote||['chrono','daily'].includes(game.mode)||history.length===0||busy;
  $('restart').disabled=!!remote;
  $('resume').hidden=!local.game;$('resume').textContent=remote?'Reprendre le solo':'Reprendre la partie';
  $('networkBar').hidden=!remote;
  if(remote?.kind==='room'){
    const o=room?.opponent;
    const remaining=Math.max(0,Math.ceil(((room?.deadline||0)-Date.now())/1000));
    $('networkStatus').textContent=room?.status==='finished'?resultText(room):`Salon ${remote.code} · Adversaire ${fmt.format(o?.score||0)} pts · ${remaining}s max`;
  }else if(remote)$('networkStatus').textContent='Défi classé · 1 tentative · date UTC : '+game.day;
  let note=hammer?'Marteau actif : choisis une pile ou un rocher.':selected>=0?`Pile ${selected+1} sélectionnée · choisis une case libre.`:'Choisis une pile, puis une case libre.';
  if(game.status==='playing'&&game.hammers>0&&!game.cells.some(c=>!c.stack.length&&!c.rock))note='Plateau plein : utilise un marteau pour libérer une case.';
  if(game.status!=='playing')note=game.status==='won'?'Niveau réussi ! Choisis le niveau suivant dans le parcours.':`Partie terminée · ${fmt.format(game.score)} points · combo ×${game.bestCombo}`;
  if(remote?.kind==='room'&&room?.status==='finished')note=resultText(room);
  if(game.mode==='daily'&&!remote&&game.day!==utcDay())note='Ce défi a expiré. Lance celui d’aujourd’hui.';
  $('boardNote').textContent=note;
}
async function play(action){
  settleTime();if(!canPlay())return;
  const thisEpoch=epoch;
  if(remote){
    busy=true;updateHud();
    try{
      const target=remote;
      const result=await api(target.kind==='room'?`rooms/${target.code}/action`:'daily/action',{seq:target.seq,action,...(target.kind==='daily'?{id:target.id}:{})});
      if(thisEpoch!==epoch)return;
      if(target.kind==='room'){room=result;remote={kind:'room',code:result.code,seq:result.seq};game=result.state;}else{game=result.state;remote={kind:'daily',id:result.id,seq:result.seq};}
      selected=-1;hammer=false;changed([{type:action.type,cell:action.cell}]);
    }catch(e){toast(e.message);if(remote?.kind==='room')await pollRoom();else if(remote?.kind==='daily')await recoverDaily();}
    finally{busy=false;updateHud();}
  }else{
    try{const previous=structuredClone(game),result=applyAction(game,action);history.push(previous);if(history.length>20)history.shift();game=result.state;selected=-1;hammer=false;changed(result.events);}
    catch(e){toast(e.message);}
  }
}
$('hammer').addEventListener('click',()=>{hammer=!hammer;selected=-1;updateHud();});
$('reroll').addEventListener('click',()=>play({type:'reroll'}));
$('undo').addEventListener('click',()=>{if(remote||['chrono','daily'].includes(game.mode)||!history.length)return;game=history.pop();selected=-1;hammer=false;changed();});
function selectPile(i){if(!canPlay()||!game.dock[i])return;selected=i;hammer=false;updateHud();renderAccessible();board.focus({preventScroll:true});sound();}
function selectCell(i){if(hammer)play({type:'hammer',cell:i});else if(selected>=0)play({type:'place',cell:i,slot:selected});else toast('Choisis d’abord une des trois piles du bas.');}
function resize(){const r=board.getBoundingClientRect();if(!r.width||!r.height)return;w=r.width;h=r.height;const dpr=Math.min(devicePixelRatio||1,local.reduced?1.25:2);board.width=Math.round(w*dpr);board.height=Math.round(h*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);geometry();}
function geometry(){if(!game)return;const R=game.radius;unit=Math.max(12,Math.min((w-30)/(3*R+2),(h-120)/(2*R*1.732*.8+3),46));const cy=(h-100)*.5+unit*.4;centers=game.cells.map(c=>({x:w/2+1.5*unit*c.q,y:cy+1.732*.8*unit*(c.r+c.q/2)}));dockCenters=[-.32,0,.32].map(v=>({x:w/2+w*v,y:h-45}));}
function hex(x,y,r,fill,stroke){ctx.beginPath();for(let i=0;i<6;i++){const a=i*Math.PI/3;const px=x+Math.cos(a)*r,py=y+Math.sin(a)*r*.8;i?ctx.lineTo(px,py):ctx.moveTo(px,py);}ctx.closePath();ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=1;ctx.stroke();}}
function token(x,y,r,color,symbol){hex(x,y+4,r,'#0005');hex(x,y,r,color,'#ffffff24');if(symbol){ctx.fillStyle='#14232cc9';ctx.font=`bold ${Math.round(r*.62)}px system-ui`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(symbol,x,y);}}
function stack(x,y,pile,scale=1){const r=unit*.82*scale,th=Math.max(3,unit*.13)*scale;for(let j=0;j<pile.length;j++){// Limit drawn height, not engine data.
    if(j<Math.max(0,pile.length-14))continue;
    const layer=j-Math.max(0,pile.length-14);token(x,y-layer*th,r,COLORS[pile[j]],local.patterns?SYMBOLS[pile[j]]:null);
  }
  if(pile.length){const top=y-(Math.min(14,pile.length)-1)*th;ctx.fillStyle='#101a20';ctx.font=`750 ${Math.round(unit*.5*scale)}px system-ui`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(topRun(pile),x,top+(local.patterns?unit*.31:0));}
}
function render(t){
  settleTime();if(activeTab==='play'&&game){geometry();ctx.clearRect(0,0,w,h);
    const order=game.cells.map((_,i)=>i).sort((a,b)=>centers[a].y-centers[b].y);
    for(const i of order){const p=centers[i],c=game.cells[i];hex(p.x,p.y+4,unit*.94,'#0c161b');hex(p.x,p.y,unit*.94,'#243840','#41565b');if(!c.stack.length&&!c.rock)hex(p.x,p.y,unit*.67,'#1c2e35','#ffffff08');}
    for(const i of order){const c=game.cells[i],p=centers[i];if(c.rock){token(p.x,p.y-5,unit*.85,c.rock===2?'#8e9d9b':'#687b7c','◆');ctx.fillStyle='#fff';ctx.font='10px system-ui';ctx.textAlign='center';ctx.fillText(c.rock===2?'II':'I',p.x,p.y+5);}else stack(p.x,p.y,c.stack);}
    if(hover>=0||document.activeElement===board){const i=hover>=0?hover:cursor,p=centers[i];if(p){ctx.save();ctx.globalAlpha=.6;hex(p.x,p.y,unit*.98,'#eec87922',hammer?'#f18480':'#eec879');ctx.restore();}}
    if(effect&&!local.reduced){const age=(t-effect.at)/550;if(age<1)for(const e of effect.events){const p=centers[e.cell??e.to];if(!p)continue;ctx.save();ctx.globalAlpha=1-age;hex(p.x,p.y-unit*age,unit*(1+age*.6),'#73cbb518','#73cbb5');if(e.points){ctx.fillStyle='#eec879';ctx.font='bold 20px system-ui';ctx.textAlign='center';ctx.fillText('+'+e.points,p.x,p.y-unit-35*age);}ctx.restore();}else effect=null;}
    for(let i=0;i<3;i++){const p=dockCenters[i];hex(p.x,p.y+3,unit*.98,'#0c161b',selected===i?'#eec879':'#41565b');if(game.dock[i]&&!(drag?.moving&&drag.slot===i))stack(p.x,p.y,game.dock[i],.85);ctx.fillStyle=selected===i?'#eec879':'#7f9598';ctx.font='10px system-ui';ctx.textAlign='center';ctx.fillText(i+1,p.x,p.y+unit+14);}
    if(drag?.moving&&game.dock[drag.slot]){ctx.save();ctx.globalAlpha=.9;stack(drag.x,drag.y-unit,game.dock[drag.slot],1);ctx.restore();}
    updateHud();
  }
  requestAnimationFrame(render);
}
function point(e){const r=board.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top};}
function cellAt(p){let best=-1,d=Infinity;centers.forEach((c,i)=>{const dd=(p.x-c.x)**2+((p.y-c.y)/.8)**2;if(dd<d){d=dd;best=i;}});return d<unit*unit?best:-1;}
function dockAt(p){return dockCenters.findIndex((c,i)=>game?.dock[i]&&Math.abs(c.x-p.x)<unit*1.3&&p.y>c.y-unit*2&&p.y<c.y+unit);}
board.addEventListener('pointerdown',e=>{if(!canPlay())return;const p=point(e),slot=dockAt(p);if(slot>=0){selectPile(slot);drag={slot,pid:e.pointerId,x:p.x,y:p.y,startX:p.x,startY:p.y,moving:false};board.setPointerCapture(e.pointerId);}else{const i=cellAt(p);if(i>=0){cursor=i;selectCell(i);}}});
board.addEventListener('pointermove',e=>{const p=point(e);hover=cellAt(p);if(drag?.pid===e.pointerId){drag.x=p.x;drag.y=p.y;drag.moving||=Math.hypot(p.x-drag.startX,p.y-drag.startY)>8;}});
board.addEventListener('pointerup',e=>{if(drag?.pid!==e.pointerId)return;const d=drag;drag=null;if(d.moving){const p=point(e),i=cellAt({x:p.x,y:p.y-unit});if(i>=0)selectCell(i);}});
board.addEventListener('pointercancel',()=>{drag=null;});board.addEventListener('pointerleave',()=>{hover=-1;});
board.addEventListener('keydown',e=>{if(['1','2','3'].includes(e.key)){e.preventDefault();selectPile(Number(e.key)-1);}else if(e.key==='Escape'){selected=-1;hammer=false;drag=null;}else if(e.key==='Enter'||e.key===' '){e.preventDefault();selectCell(cursor);}else if(e.key.startsWith('Arrow')){e.preventDefault();const current=centers[cursor],dx=e.key==='ArrowLeft'?-1:e.key==='ArrowRight'?1:0,dy=e.key==='ArrowUp'?-1:e.key==='ArrowDown'?1:0;let best=Infinity,next=cursor;centers.forEach((p,i)=>{const x=p.x-current.x,y=p.y-current.y,dot=x*dx+y*dy;if(dot<=1)return;const perpendicular=Math.abs(x*dy-y*dx);const cost=Math.hypot(x,y)+perpendicular*2;if(cost<best){best=cost;next=i;}});cursor=next;hover=-1;}});
function renderAccessible(){if(!game)return;const dock=$('accessibleDock'),cells=$('accessibleBoard');dock.replaceChildren();cells.replaceChildren();for(let i=0;i<3;i++){const b=document.createElement('button');b.textContent=`Pile ${i+1} : ${game.dock[i]?.map(c=>NAMES[c]).join(', ')||'vide'}`;b.disabled=!game.dock[i];b.setAttribute('aria-pressed',String(selected===i));b.onclick=()=>selectPile(i);dock.append(b);}game.cells.forEach((c,i)=>{const b=document.createElement('button');b.textContent=`${i+1} · ${c.rock?'rocher':c.stack.length?c.stack.map(x=>NAMES[x]).join(', '):'libre'}`;b.setAttribute('aria-label',`Case ${i+1}, coordonnées ${c.q}, ${c.r} : ${c.rock?'rocher, résistance '+c.rock:c.stack.length?c.stack.map(x=>NAMES[x]).join(', '):'libre'}`);b.onclick=()=>selectCell(i);cells.append(b);});}
async function api(path,body){const res=await fetch(new URL('./api/'+path,import.meta.url),{method:body===undefined?'GET':'POST',headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(6000)});let data;try{data=await res.json();}catch{throw Error('Serveur multijoueur indisponible. Le solo reste jouable.');}if(!res.ok)throw Error(data.error||'Requête refusée');return data;}
async function connect(){try{me=await api('me');connectionReady=true;$('connection').textContent='Arena connectée';$('playerName').textContent=me.name;$('playerRating').textContent=`${me.rating} Elo · ${me.wins} V / ${me.draws} N / ${me.losses} D`;$('nickname').value=me.name;if(me.activeRoom){room=await api('rooms/'+me.activeRoom);updateRoom();}}catch{$('connection').textContent='Solo hors ligne';$('playerName').textContent='Serveur non connecté';}for(const id of ['createRoom','rankedDaily'])$(id).disabled=!connectionReady;}
function resultText(r){if(!r.result)return'Partie terminée';const delta=r.result.delta[me?.id]||0;return `${!r.result.winner?'Égalité':r.result.winner===me?.id?'Victoire !':'Défaite'} · ${delta>=0?'+':''}${delta} Elo`;}
function updateRoom(){if(!room)return;$('roomInfo').hidden=false;$('roomTitle').textContent='SALON '+room.code;$('roomCode').value=room.code;$('roomDetail').textContent=room.status==='waiting'?'En attente d’un adversaire. Partage ce code.':room.status==='finished'?resultText(room):room.status==='cancelled'?'Salon fermé.':room.players.map(x=>x.name).join(' contre ')+' · 40 piles chacun';$('openMatch').hidden=room.status!=='playing'&&room.status!=='finished';$('resign').hidden=!['waiting','playing'].includes(room.status);if(remote?.kind==='room'&&remote.code===room.code){const stateChanged=remote.seq!==room.seq||game?.status!==room.state?.status;remote.seq=room.seq;game=room.state;if(stateChanged)changed();else updateHud();}}
function enterRoom(){if(!room?.state)return;if(!remote)saveLocal();epoch++;remote={kind:'room',code:room.code,seq:room.seq};game=room.state;selected=-1;hammer=false;history=[];lastTick=Date.now();updateRoom();changed();setTab('play');}
async function pollRoom(){if(!room||pollBusy)return;pollBusy=true;const code=room.code,thisEpoch=epoch;try{const r=await api('rooms/'+code);if(room?.code!==code||epoch!==thisEpoch)return;if(r.seq<room.seq)return;const started=room.status==='waiting'&&r.status==='playing';room=r;updateRoom();if(started)toast('Ton adversaire est arrivé. Le duel commence !');}catch(e){if(Date.now()-lastPollError>15000){toast(e.message);lastPollError=Date.now();}}finally{pollBusy=false;}}
$('createRoom').addEventListener('click',async()=>{try{room=await api('rooms',{});updateRoom();refreshRooms();}catch(e){toast(e.message);}});
$('joinForm').addEventListener('submit',async e=>{e.preventDefault();try{const code=$('roomCode').value.trim().toUpperCase();room=await api('rooms/'+code+'/join',{});updateRoom();enterRoom();}catch(err){toast(err.message);}});
$('openMatch').addEventListener('click',enterRoom);$('returnArena').addEventListener('click',()=>setTab('arena'));
$('resign').addEventListener('click',async()=>{if(!room||!confirm('Fermer ce salon ou abandonner ce duel ? Un abandon compte comme une défaite.'))return;try{room=await api('rooms/'+room.code+'/resign',{});updateRoom();await connect();}catch(e){toast(e.message);}});
$('profileForm').addEventListener('submit',async e=>{e.preventDefault();try{await api('profile',{name:$('nickname').value});await connect();toast('Pseudo enregistré.');}catch(err){toast(err.message);}});
async function refreshRooms(){if(!connectionReady)return;try{const data=await api('rooms');$('roomList').replaceChildren();if(!data.rooms.length)$('roomList').textContent='Pas de salon ouvert. Crée le premier.';for(const r of data.rooms){const b=document.createElement('button');b.textContent=r.name+' · '+r.code;b.onclick=()=>{$('roomCode').value=r.code;$('roomCode').focus();};$('roomList').append(b);}}catch(e){toast(e.message);}}
$('refreshRooms').addEventListener('click',refreshRooms);
async function recoverDaily(){const data=await api('daily',{});if(remote?.kind!=='daily')return;game=data.state;remote={kind:'daily',id:data.id,seq:data.seq};changed();}
$('rankedDaily').addEventListener('click',async()=>{if(room&&['waiting','playing'].includes(room.status)){toast('Termine ou abandonne ton duel avant le défi.');return;}try{const data=await api('daily',{});if(!remote)saveLocal();epoch++;remote={kind:'daily',id:data.id,seq:data.seq};game=data.state;selected=-1;hammer=false;history=[];changed();setTab('play');}catch(e){toast(e.message);}});
function rows(target,items,fields){target.replaceChildren();if(!items.length){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=4;td.textContent='Les premières places sont à prendre.';tr.append(td);target.append(tr);}items.forEach((p,i)=>{const tr=document.createElement('tr');for(const text of [i+1,p.name,...fields(p)]){const td=document.createElement('td');td.textContent=text;tr.append(td);}target.append(tr);});}
async function refreshLadder(){try{const data=await api('ladder');$('dailyDate').textContent=data.day;rows($('eloRows'),data.players,p=>[p.rating,`${p.wins} / ${p.draws} / ${p.losses}`]);rows($('dailyRows'),data.daily,p=>[fmt.format(p.score),'×'+p.combo]);}catch(e){toast(e.message);}}
$('refreshLadder').addEventListener('click',refreshLadder);
$('help').addEventListener('click',()=>$('helpDialog').showModal());for(const id of ['closeHelp','gotIt'])$(id).addEventListener('click',()=>$('helpDialog').close());
window.addEventListener('resize',resize);document.addEventListener('visibilitychange',()=>{settleTime();saveLocal();if(!document.hidden&&room)pollRoom();});window.addEventListener('pagehide',()=>{settleTime();saveLocal();});
if(game){if(game.mode==='daily'&&game.day!==utcDay())game=null;else if(game.mode==='chrono'&&local.savedAt)game=advanceTime(game,Math.max(0,Date.now()-local.savedAt));}
if(!game)game=createGame({difficulty:local.difficulty,level:local.progress[local.difficulty].unlocked,seed:crypto.getRandomValues(new Uint32Array(1))[0],noTools:local.noTools});
changed();resize();requestAnimationFrame(render);connect();
setInterval(()=>{if(room&&['waiting','playing'].includes(room.status)&&!document.hidden)pollRoom();},1500);
if('serviceWorker'in navigator)navigator.serviceWorker.register(new URL('./sw.js',import.meta.url)).catch(()=>{});
