// Aperçu local avec données fictives uniquement. Ne fait aucune requête au service public.
const http=require('node:http');
const {DatabaseSync}=require('node:sqlite');
const {createHmac}=require('node:crypto');
const {spawn}=require('node:child_process');
const {pathToFileURL}=require('node:url');
const path=require('node:path');
const SECRET='local-skin-fixture-secret-at-least-32-characters';
const sign=s=>createHmac('sha256',SECRET).update(s).digest('base64url');
const account=id=>sign('account:'+id);
require('node:fs').mkdirSync('.tmp',{recursive:true});
const db=new DatabaseSync('.tmp/skin-local.sqlite');
const prepare=query=>{let args=[];const params=()=>{const names=[...new Set(query.match(/\?\d+/g)||[])];return names.length?[Object.fromEntries(names.map(n=>[n,args[+n.slice(1)-1]]))]:args};const s={bind:(...v)=>(args=v,s),run:async()=>({meta:{changes:Number(db.prepare(query).run(...params()).changes)}}),all:async()=>({results:db.prepare(query).all(...params())}),first:async()=>db.prepare(query).get(...params())??null};return s;};
const DB={prepare,batch:async list=>{const r=[];for(const s of list)r.push(await s.run());return r;}};
const player={id:'fixture-full',name:'Pasero — test local',position:'GK',age:23,overall:96,potential:103,value:100000,traits:[],attributes:{subs:{gkDiving:103,gkHandling:102,gkKicking:103,gkReflexes:103,gkPositioningSub:103,gkSprintSpeed:64,gkAcceleration:60}}};
const light={...player,id:'fixture-light',name:'Joueur léger — test local',attributes:{div:90,han:90,kic:90,ref:90,pos:90,spe:60,subs:{}}};
let refreshedSquad=null;
(async()=>{
const worker=(await import(pathToFileURL(path.resolve('worker.d1.js')).href)).default;
const env={DB,SITE_TOKEN:'local-only'};
http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://localhost:4211');
  if(url.pathname==='/__test/sync-club' && req.method==='POST') {
    const chunks=[];for await(const c of req)chunks.push(c);
    const body=JSON.parse(Buffer.concat(chunks).toString());
    if(body.teamId!=='fixture-club'||!Array.isArray(body.players))throw new Error('Fixture locale invalide');
    refreshedSquad=body;
    res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({accepted:1,rejected:0}));return;
  }
  if(url.pathname.startsWith('/__test/login/')){
    const id=url.pathname.split('/').pop();const payload=Buffer.from(JSON.stringify({sub:id,name:'Compte test '+id,exp:Date.now()+86400000})).toString('base64url');
    res.writeHead(302,{'Set-Cookie':'gmc-session='+payload+'.'+sign('session:'+payload)+'; Path=/; HttpOnly; SameSite=Lax','Location':'http://localhost:3211/compte'});res.end();return;
  }
  if(url.pathname.startsWith('/v1/site/preferences/')||url.pathname.startsWith('/v1/site/me/')){
    const chunks=[];for await(const c of req)chunks.push(c);const body=Buffer.concat(chunks);
    const response=await worker.fetch(new Request(url,{method:req.method,headers:req.headers,body:['GET','HEAD'].includes(req.method)?undefined:body}),env);
    res.writeHead(response.status,{'content-type':'application/json'});res.end(await response.text());return;
  }
  let data;
  if(url.pathname.startsWith('/v1/site/player/')){const p=refreshedSquad?.players.find(p=>url.pathname.endsWith('/'+p.id))||(url.pathname.endsWith('fixture-light')?light:player);data={player:p,light:!refreshedSquad&&p===light,fetchedAt:refreshedSquad?.fetchedAt||Date.now(),teamId:'fixture-club'};}
  else if(url.pathname.startsWith('/v1/site/status/'))data={light:true,requestedAt:null};
  else if(url.pathname==='/v1/site/clubs')data={clubs:[{teamId:'fixture-club',name:'Club test local',fetchedAt:Date.now()}]};
  else if(url.pathname.startsWith('/v1/site/club/'))data={teamId:'fixture-club',name:'Club test local',fetchedAt:refreshedSquad?.fetchedAt||Date.now(),requestedAt:null,players:refreshedSquad?refreshedSquad.players.map(player=>({player,light:false})):[{player,light:false},{player:light,light:true}]};
  else data={players:[{player,light:false,teamId:'fixture-club',fetchedAt:Date.now()}],total:1,page:1,pages:1};
  res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(data));
 }catch(e){res.writeHead(500);res.end(JSON.stringify({error:e.message}));}
}).listen(4211,'127.0.0.1',()=>{
 const child=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','-p','3211'],{stdio:'inherit',windowsHide:true,env:{...process.env,NEXT_SITE_URL:'http://localhost:3211',GMC_SITE_TOKEN:'local-only',GMC_INDEX_URL:'http://localhost:4211',GOOGLE_CLIENT_ID:'local-test-only',GOOGLE_CLIENT_SECRET:'local-test-only',AUTH_SECRET:SECRET,PREMIUM_ACCOUNT_KEYS:account('A')}});
 process.on('SIGINT',()=>{child.kill();process.exit();});
});
})();

