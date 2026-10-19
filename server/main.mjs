import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomInt, createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGame, applyAction, hashSeed, utcDay } from '../shared/engine.mjs';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const MIME={'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.webmanifest':'application/manifest+json','.svg':'image/svg+xml'};
const STATIC=new Set(['index.html','app.mjs','style.css','sw.js','manifest.webmanifest','icon.svg','shared/engine.mjs','shared/storage.mjs','legacy/index.html']);
const tokenHash=t=>createHash('sha256').update(t).digest('hex');
const id=()=>randomBytes(16).toString('hex');
const error=(status,message)=>Object.assign(Error(message),{status});
const safeName=n=>typeof n==='string'&&/^[\p{L}\p{N} _.-]{2,24}$/u.test(n.trim())?n.trim():null;

export function createServer({ database='data/arena.sqlite', publicOrigin=process.env.PUBLIC_ORIGIN, now=()=>Date.now() }={}) {
  if(database!==':memory:')mkdirSync(dirname(database),{recursive:true});
  if(publicOrigin){const u=new URL(publicOrigin);if(u.origin!==publicOrigin||!['http:','https:'].includes(u.protocol))throw Error('PUBLIC_ORIGIN doit être une origine HTTP(S) sans chemin');}
  const db=new DatabaseSync(database);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS players(id TEXT PRIMARY KEY,name TEXT NOT NULL,rating INTEGER NOT NULL DEFAULT 1000,wins INTEGER NOT NULL DEFAULT 0,losses INTEGER NOT NULL DEFAULT 0,draws INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS sessions(hash TEXT PRIMARY KEY,player TEXT NOT NULL REFERENCES players(id),expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS rooms(code TEXT PRIMARY KEY,data TEXT NOT NULL,created INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS actions(room TEXT NOT NULL,player TEXT NOT NULL,seq INTEGER NOT NULL,action TEXT NOT NULL,PRIMARY KEY(room,player,seq));
    CREATE TABLE IF NOT EXISTS daily_runs(id TEXT PRIMARY KEY,player TEXT NOT NULL REFERENCES players(id),day TEXT NOT NULL,data TEXT NOT NULL,seq INTEGER NOT NULL DEFAULT 0);
    CREATE UNIQUE INDEX IF NOT EXISTS daily_one_run ON daily_runs(player,day);
    CREATE TABLE IF NOT EXISTS daily_scores(player TEXT NOT NULL REFERENCES players(id),day TEXT NOT NULL,score INTEGER NOT NULL,combo INTEGER NOT NULL,PRIMARY KEY(player,day));
  `);
  const limits=new Map();
  function rate(key,max=240) {
    const t=now();let bucket=limits.get(key);
    if(!bucket||t-bucket.time>60000){bucket={time:t,count:0};limits.set(key,bucket);}
    if(++bucket.count>max)throw error(429,'Trop de requêtes. Réessaie dans une minute.');
  }
  function getRoom(code) {const row=db.prepare('SELECT data FROM rooms WHERE code=?').get(code);if(!row)throw error(404,'Salon introuvable');return JSON.parse(row.data);}
  const saveRoom=r=>db.prepare('UPDATE rooms SET data=? WHERE code=?').run(JSON.stringify(r),r.code);
  function transact(fn){db.exec('BEGIN IMMEDIATE');try{const r=fn();db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}}
  function finish(r) {
    if(r.status!=='playing')return;
    const [a,b]=r.players,as=r.games[a],bs=r.games[b];
    if(now()<r.deadline&&as.status==='playing'&& !r.forfeits.includes(a))return;
    if(now()<r.deadline&&bs.status==='playing'&& !r.forfeits.includes(b))return;
    r.status='finished';
    const score=p=>r.forfeits.includes(p)?-1:r.games[p].score;
    const result=score(a)===score(b)?.5:score(a)>score(b)?1:0;
    const pa=db.prepare('SELECT rating FROM players WHERE id=?').get(a),pb=db.prepare('SELECT rating FROM players WHERE id=?').get(b);
    const delta=Math.round(24*(result-1/(1+10**((pb.rating-pa.rating)/400))));
    r.result={winner:result===.5?null:result===1?a:b,delta:{[a]:delta,[b]:-delta},scores:{[a]:score(a),[b]:score(b)}};
    for(const [p,v,d] of [[a,result,delta],[b,1-result,-delta]])db.prepare('UPDATE players SET rating=rating+?,wins=wins+?,losses=losses+?,draws=draws+? WHERE id=?').run(d,v===1?1:0,v===0?1:0,v===.5?1:0,p);
  }
  function sweep() {
    const t=now();
    transact(()=>{
      for(const row of db.prepare('SELECT data FROM rooms').iterate()) {
        const r=JSON.parse(row.data);
        if(r.status==='playing'&&t>=r.deadline){finish(r);saveRoom(r);}
        else if(r.status==='waiting'&&t-r.created>600000){r.status='cancelled';saveRoom(r);}
      }
      db.prepare('DELETE FROM sessions WHERE expires<?').run(t);
      db.prepare('DELETE FROM rooms WHERE created<?').run(t-30*86400000);
      db.prepare('DELETE FROM actions WHERE room NOT IN (SELECT code FROM rooms)').run();
      db.prepare('DELETE FROM daily_runs WHERE day<?').run(utcDay(t-30*86400000));
    });
    for(const [key,b]of limits)if(t-b.time>60000)limits.delete(key);
  }
  function session(req,res) {
    const raw=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('hexa_session='))?.slice(13);
    if(raw&&/^[a-f0-9]{64}$/.test(raw)) {
      const row=db.prepare('SELECT player FROM sessions WHERE hash=? AND expires>?').get(tokenHash(raw),now());
      if(row)return row.player;
    }
    rate(`session:${req.socket.remoteAddress}`,8);
    const player=id(),secret=randomBytes(32).toString('hex');
    db.prepare('INSERT INTO players(id,name) VALUES(?,?)').run(player,'Joueur '+player.slice(0,4));
    db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(tokenHash(secret),player,now()+30*86400000);
    res.setHeader('Set-Cookie',`hexa_session=${secret}; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000${publicOrigin?.startsWith('https:')?'; Secure':''}`);
    return player;
  }
  function view(r,p) {
    const other=r.players.find(x=>x!==p);
    return {code:r.code,status:r.status,created:r.created,deadline:r.deadline??null,players:r.players.map(x=>db.prepare('SELECT id,name,rating FROM players WHERE id=?').get(x)),state:r.games[p]??null,seq:r.seq[p]??0,opponent:other?{score:r.games[other].score,turn:r.games[other].turn,status:r.forfeits.includes(other)?'forfeit':r.games[other].status}:null,result:r.result??null,forfeits:r.forfeits};
  }
  function active(p) {
    return db.prepare('SELECT data FROM rooms').all().map(x=>JSON.parse(x.data)).find(r=>['waiting','playing'].includes(r.status)&&r.players.includes(p));
  }
  async function body(req) {
    if(!(req.headers['content-type']||'').startsWith('application/json'))throw error(415,'JSON requis');
    let text='';for await(const chunk of req){text+=chunk;if(Buffer.byteLength(text)>4096)throw error(413,'Requête trop volumineuse');}
    try{const obj=JSON.parse(text);if(!obj||Array.isArray(obj)||typeof obj!=='object')throw 0;return obj;}catch{throw error(400,'JSON invalide');}
  }
  const server=http.createServer(async(req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','same-origin');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
    res.setHeader('X-Frame-Options','DENY');
    try {
      const url=new URL(req.url,'http://localhost');
      if(!url.pathname.startsWith('/api/')) {
        if(req.method!=='GET'&&req.method!=='HEAD')throw error(405,'Méthode interdite');
        const path=url.pathname==='/'?'index.html':url.pathname.slice(1);
        if(!STATIC.has(path))throw error(404,'Fichier introuvable');
        const bytes=await readFile(resolve(ROOT,path));
        res.setHeader('Content-Type',MIME[path.slice(path.lastIndexOf('.'))]||'text/plain');
        if(path==='legacy/index.html')res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; object-src 'none'; frame-ancestors 'none'");
        res.setHeader('Cache-Control','no-cache');res.writeHead(200);res.end(req.method==='HEAD'?undefined:bytes);return;
      }
      res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');
      rate(`ip:${req.socket.remoteAddress}`);
      if(req.method!=='GET') {
        const port=server.address().port;
        const allowed=publicOrigin?[publicOrigin]:[`http://localhost:${port}`,`http://127.0.0.1:${port}`,`http://[::1]:${port}`];
        if(!allowed.includes(req.headers.origin))throw error(403,'Origine refusée');
      }
      const p=session(req,res),path=url.pathname;
      let output;
      if(req.method==='GET'&&path==='/api/me') {
        const a=active(p);output={...db.prepare('SELECT * FROM players WHERE id=?').get(p),activeRoom:a?.code??null,day:utcDay(now())};
      }else if(req.method==='POST'&&path==='/api/profile') {
        const b=await body(req),name=safeName(b.name);if(!name)throw error(400,'Pseudo : 2 à 24 lettres, chiffres, espaces, . _ ou -');
        db.prepare('UPDATE players SET name=? WHERE id=?').run(name,p);output={ok:true};
      }else if(req.method==='GET'&&path==='/api/ladder') {
        output={players:db.prepare('SELECT id,name,rating,wins,losses,draws FROM players WHERE wins+losses+draws>0 ORDER BY rating DESC,id LIMIT 50').all(),daily:db.prepare('SELECT p.id,p.name,d.score,d.combo FROM daily_scores d JOIN players p ON p.id=d.player WHERE day=? ORDER BY score DESC,combo DESC,p.id LIMIT 50').all(utcDay(now())),day:utcDay(now())};
      }else if(req.method==='GET'&&path==='/api/rooms') {
        output={rooms:db.prepare('SELECT data FROM rooms').all().map(x=>JSON.parse(x.data)).filter(r=>r.status==='waiting').slice(-30).map(r=>({code:r.code,name:db.prepare('SELECT name FROM players WHERE id=?').get(r.players[0]).name,created:r.created}))};
      }else if(req.method==='POST'&&path==='/api/rooms') {
        await body(req);rate(`room:${p}`,10);if(active(p))throw error(409,'Tu as déjà un salon actif. Reprends-le ou abandonne-le.');
        let code;do{code=randomBytes(4).toString('hex').toUpperCase();}while(db.prepare('SELECT code FROM rooms WHERE code=?').get(code));
        const r={code,status:'waiting',created:now(),players:[p],seed:randomInt(0,0x100000000),games:{},seq:{[p]:0},forfeits:[]};
        db.prepare('INSERT INTO rooms VALUES(?,?,?)').run(code,JSON.stringify(r),r.created);output=view(r,p);
      }else if(/^\/api\/rooms\/[A-F0-9]{8}(?:\/(join|action|resign))?$/.test(path)) {
        const [,code,verb]=path.match(/^\/api\/rooms\/([A-F0-9]{8})(?:\/(join|action|resign))?$/);
        const b=req.method==='POST'?await body(req):null;
        output=transact(()=>{
          const r=getRoom(code);
          if(verb==='join'&&req.method==='POST') {
            if(!r.players.includes(p)) {
              if(r.status!=='waiting'||r.players.length!==1)throw error(409,'Salon complet ou terminé');
              if(active(p))throw error(409,'Tu as déjà un salon actif');
              r.players.push(p);r.status='playing';r.deadline=now()+600000;
              for(const player of r.players){r.games[player]=createGame({seed:r.seed,mode:'duel'});r.seq[player]=0;}
            }
          }else {
            if(!r.players.includes(p))throw error(403,'Ce salon ne t’appartient pas');
            if(verb==='action'&&req.method==='POST') {
              if(r.status!=='playing'||r.forfeits.includes(p)||now()>=r.deadline)throw error(409,'Partie inactive');
              if(!Number.isSafeInteger(b.seq)||b.seq!==r.seq[p])throw error(409,'État périmé. Actualise la partie.');
              try{r.games[p]=applyAction(r.games[p],b.action).state;}catch(e){throw error(400,e.message);}
              db.prepare('INSERT INTO actions VALUES(?,?,?,?)').run(code,p,b.seq,JSON.stringify(b.action));r.seq[p]++;
            }else if(verb==='resign'&&req.method==='POST') {
              if(r.status==='waiting')r.status='cancelled';
              else if(r.status==='playing') {
                if(!r.forfeits.includes(p))r.forfeits.push(p);
                // An explicit forfeit ends the duel immediately; no waiting for 40 moves.
                r.deadline=now();
              }
            }else if(verb||req.method!=='GET')throw error(405,'Méthode interdite');
          }
          finish(r);saveRoom(r);return view(r,p);
        });
      }else if(path==='/api/daily'&&req.method==='POST') {
        await body(req);const day=utcDay(now());
        let row=db.prepare('SELECT * FROM daily_runs WHERE player=? AND day=?').get(p,day);
        if(!row){const state=createGame({mode:'daily',seed:hashSeed('hexa-v6-'+day),day});const run=id();db.prepare('INSERT INTO daily_runs(id,player,day,data) VALUES(?,?,?,?)').run(run,p,day,JSON.stringify(state));row={id:run,data:JSON.stringify(state),seq:0};}
        output={id:row.id,state:JSON.parse(row.data),seq:row.seq};
      }else if(path==='/api/daily/action'&&req.method==='POST') {
        const b=await body(req);
        output=transact(()=>{
          const row=db.prepare('SELECT * FROM daily_runs WHERE id=? AND player=?').get(typeof b.id==='string'?b.id:'',p);
          if(!row)throw error(404,'Défi introuvable');if(row.day!==utcDay(now()))throw error(409,'Ce défi a expiré : commence celui d’aujourd’hui.');
          if(!Number.isSafeInteger(b.seq)||b.seq!==row.seq)throw error(409,'État périmé : reprends le défi.');
          let state;try{state=applyAction(JSON.parse(row.data),b.action).state;}catch(e){throw error(400,e.message);}
          db.prepare('UPDATE daily_runs SET data=?,seq=seq+1 WHERE id=?').run(JSON.stringify(state),row.id);
          if(state.status!=='playing')db.prepare('INSERT INTO daily_scores VALUES(?,?,?,?) ON CONFLICT(player,day) DO UPDATE SET score=excluded.score,combo=excluded.combo').run(p,row.day,state.score,state.bestCombo);
          return{id:row.id,state,seq:row.seq+1};
        });
      }else throw error(404,'Route inconnue');
      res.writeHead(200);res.end(JSON.stringify(output));
    }catch(e){
      const status=e.status||500;
      if(status===500)console.error(e);
      res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify({error:status===500?'Erreur interne':e.message}));
    }
  });
  server.requestTimeout=10000;server.headersTimeout=10000;
  const timer=setInterval(()=>{try{sweep();}catch(e){console.error(e);}},15000);timer.unref();
  server.on('close',()=>{clearInterval(timer);db.close();});
  return {server,db,sweep};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const port=Number(process.env.PORT||3000),host=process.env.HOST||'127.0.0.1';
  const {server}=createServer({database:process.env.DATABASE||'data/arena.sqlite'});
  server.listen(port,host,()=>console.log(`Hexa Sort Arena : http://${host}:${port}`));
  for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>server.close(()=>process.exit(0)));
}
