const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),vm=require('node:vm'),{spawn}=require('node:child_process');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'azit-notifications-')),root=path.resolve(__dirname,'../..'),base='http://127.0.0.1:19418';
const keys=require('web-push').generateVAPIDKeys(),env={...process.env,NODE_ENV:'test',HOST:'127.0.0.1',PORT:'19418',DATABASE_FILE:path.join(dir,'db.json'),SQLITE_FILE:path.join(dir,'db.sqlite'),GEMINI_API_KEY:'',OPENAI_API_KEY:'',VAPID_PUBLIC_KEY:keys.publicKey,VAPID_PRIVATE_KEY:keys.privateKey};
let child,logs='';
async function req(route,token,body,method=body===undefined?'GET':'POST'){const r=await fetch(base+'/api'+route,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,data:await r.json()};}
async function browserTests(){
 const elements=new Map(),events={},storage=new Map();let prompts=0,subscribed=0,removed=0,registered=0,settings=true;
 for(const id of ['btnBrowserNotifications','notificationStatus','allowFirstContact'])elements.set(id,{textContent:'',disabled:false,addEventListener(type,fn){this[type]=fn;}});
 const sub={endpoint:'https://fcm.googleapis.com/fcm/send/browser-test',toJSON(){return {endpoint:this.endpoint};},async unsubscribe(){removed++;}};
 const reg={pushManager:{async getSubscription(){return subscribed?sub:null;},async subscribe(){subscribed++;return sub;}}};
 const api={isConnected:()=>true,async request(route,method,body){if(route==='/notifications'&&!method)return {enabled:settings,pushAvailable:true,publicKey:keys.publicKey};if(route==='/notifications'&&method==='PUT')settings=body.enabled;if(route.startsWith('/notifications/inbox'))return {items:[]};return {success:true};}};
 const window={ApiClient:api,isSecureContext:true,Notification:{},PushManager:{},addEventListener:(name,fn)=>events[name]=fn,dispatchEvent(){}};
 const navigator={userAgent:'test',serviceWorker:{async register(){registered++;return reg;},ready:Promise.resolve(reg),async getRegistration(){return reg;},addEventListener(){}}};
 const sandbox={window,navigator,Notification:{permission:'default',async requestPermission(){prompts++;this.permission='granted';return 'granted';}},document:{visibilityState:'visible',getElementById:id=>elements.get(id),addEventListener(){}},localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},CustomEvent:class{},setInterval(){},atob:s=>Buffer.from(s,'base64').toString('binary'),Uint8Array};
 vm.runInNewContext(fs.readFileSync(path.join(root,'notifications.js'),'utf8'),sandbox);
 events['azit-account-ready']();await new Promise(r=>setImmediate(r));assert.equal(prompts,0,'No unsolicited browser permission prompt');
 await elements.get('btnBrowserNotifications').click();assert.equal(prompts,1);assert.equal(registered,1);assert.equal(subscribed,1);
 elements.get('allowFirstContact').checked=false;await elements.get('allowFirstContact').change();assert.equal(settings,false);
 await window.AzitNotifications.logout();assert.equal(removed,1);assert.equal(storage.get('azit_push_enabled'),'0');
 const workerEvents={};let notice,focused=false,opened;
 const client={url:'https://azitchat.com/',async focus(){focused=true;},postMessage(value){opened=value;}};
 const self={location:{origin:'https://azitchat.com'},addEventListener:(key,fn)=>workerEvents[key]=fn,registration:{async showNotification(title,options){notice={title,options};}},clients:{async matchAll(){return [client];}}};
 vm.runInNewContext(fs.readFileSync(path.join(root,'notification-worker.js'),'utf8'),{self,URL,encodeURIComponent});
 let waiting;workerEvents.push({data:{json:()=>({characterId:'chaewon',body:'private secret'})},waitUntil:p=>waiting=p});await waiting;assert.equal(notice.title,'아지트챗');assert(!JSON.stringify(notice).includes('private secret'));
 workerEvents.notificationclick({notification:{data:notice.options.data,close(){}},waitUntil:p=>waiting=p});await waiting;assert(focused);assert.equal(opened.characterId,'chaewon');
}
(async()=>{try{
 child=spawn(process.execPath,['server/server.js'],{cwd:root,env,stdio:['ignore','pipe','pipe']});child.stdout.on('data',b=>logs+=b);child.stderr.on('data',b=>logs+=b);
 let ready=false;for(let i=0;i<100;i++){try{ready=(await fetch(base+'/api/health')).ok;}catch{}if(ready)break;await new Promise(r=>setTimeout(r,50));}assert(ready,logs);
 assert.equal((await req('/notifications')).status,401);assert.equal((await req('/notifications/inbox')).status,401);
 const one=(await req('/auth/guest',null,{})).data,two=(await req('/auth/guest',null,{})).data;
 const config=(await req('/notifications',one.token)).data;assert(config.enabled);assert(config.pushAvailable);assert.equal(config.publicKey,keys.publicKey);assert(!JSON.stringify(config).includes(keys.privateKey));
 assert.equal((await req('/notifications',one.token,{enabled:'false'},'PUT')).status,400);
 assert.equal((await req('/notifications',one.token,{enabled:false},'PUT')).status,200);assert.equal((await req('/notifications',one.token)).data.enabled,false);assert.equal((await req('/notifications',two.token)).data.enabled,true);
 assert.equal((await req('/notifications/subscribe',one.token,{subscription:{endpoint:'http://127.0.0.1/private'}})).status,400);
 const ec=crypto.createECDH('prime256v1');ec.generateKeys();const subscription={endpoint:'https://fcm.googleapis.com/fcm/send/api-test',keys:{auth:crypto.randomBytes(16).toString('base64url'),p256dh:ec.getPublicKey().toString('base64url')}};
 assert.equal((await req('/notifications/subscribe',one.token,{subscription})).status,200);
 const {DatabaseSync}=require('node:sqlite'),sql=new DatabaseSync(env.SQLITE_FILE);
 await req('/notifications/unsubscribe',two.token,{endpoint:subscription.endpoint});assert.equal(sql.prepare('SELECT count(*) n FROM push_subscriptions').get().n,1,'Other accounts cannot unsubscribe this device');
 await req('/notifications/unsubscribe',one.token,{endpoint:subscription.endpoint});assert.equal(sql.prepare('SELECT count(*) n FROM push_subscriptions').get().n,0);sql.close();
 for(const file of ['notification-worker.js','notifications.js','manifest.webmanifest','app-icon.svg']){const response=await fetch(base+'/'+file);assert.equal(response.status,200);assert(!(await response.text()).startsWith('<!DOCTYPE html>'));}
 const html=await(await fetch(base+'/')).text();for(const script of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))if(script[1].trim())new vm.Script(script[1]);
 await browserTests();
 console.log('PASS: authenticated notification settings, account isolation, protected device unsubscribe, safe static worker/manifest, consent only on click, logout removal, generic push display and authenticated room deep link');
 }finally{if(child&&child.exitCode===null){const done=new Promise(r=>child.once('exit',r));child.kill();await done;}fs.rmSync(dir,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1;});
