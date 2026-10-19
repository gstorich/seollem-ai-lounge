const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.resolve(__dirname,'../../analytics.js'),'utf8');
async function run(consent,pathname='/',dnt='0'){
 const handlers={},scripts=[],requests=[];
 const context={console,URL,navigator:{doNotTrack:dnt},location:{pathname,origin:'https://azitchat.com',search:'?phone=01099999999',hash:'#private-message',reload(){}},localStorage:{getItem:()=>consent},sessionStorage:{getItem:()=>null,removeItem(){}},document:{referrer:'https://example.com/?phone=01099999999',addEventListener(){},createElement(){return {};},head:{appendChild:s=>scripts.push(s.src)}},addEventListener:(name,fn)=>handlers[name]=fn,fetch:async url=>{requests.push(url);return {json:async()=>({gaMeasurementId:'G-ABCDEF1234'})};}};
 context.window=context;vm.runInNewContext(source,context);await new Promise(r=>setImmediate(r));return {context,handlers,scripts,requests};
}
(async()=>{
 const denied=await run('denied');assert.equal(denied.requests.length,0);assert.equal(denied.scripts.length,0);
 const admin=await run('granted','/admin');assert.equal(admin.requests.length,0);assert.equal(admin.scripts.length,0);
 const dnt=await run('granted','/','1');assert.equal(dnt.scripts.length,0);
 const allowed=await run('granted');assert.equal(allowed.scripts.length,1);assert(allowed.scripts[0].startsWith('https://www.googletagmanager.com/gtag/js?id=G-'));
 allowed.handlers['azit-product-event']({detail:'chat_message_sent'});
 allowed.handlers['azit-product-event']({detail:'01099999999'});
 const calls=allowed.context.dataLayer.map(x=>Array.from(x));
 assert(calls.some(x=>x[0]==='event'&&x[1]==='chat_message_sent'));
 const serialized=JSON.stringify(calls);assert(!serialized.includes('01099999999'));assert(!serialized.includes('private-message'));assert(!serialized.includes('user_id'));
 const config=calls.find(x=>x[0]==='config')[2];assert.equal(config.cookie_expires,180*86400);assert.equal(config.cookie_update,false);assert.equal(config.send_page_view,false);assert.equal(config.allow_google_signals,false);assert.equal(config.allow_ad_personalization_signals,false);assert.equal(config.page_location,'https://azitchat.com/');assert.equal(config.page_referrer,'https://example.com');
 console.log('PASS: GA consent/DNT/admin exclusion, explicit event whitelist, sanitized URL/referrer and no customer identifiers');
})().catch(e=>{console.error(e);process.exitCode=1;});
