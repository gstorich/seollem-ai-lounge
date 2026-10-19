const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.resolve(__dirname,'../../analytics.js'),'utf8');
async function run(consent,pathname='/',dnt='0',search='?phone=01099999999',tester=false){
 const handlers={},scripts=[],requests=[];
 const context={console,URL,URLSearchParams,navigator:{doNotTrack:dnt},location:{pathname,origin:'https://azitchat.com',search,hash:'#private-message',reload(){}},localStorage:{getItem:key=>key==='azit_tester'?(tester?'1':null):consent},sessionStorage:{getItem:()=>null,removeItem(){}},document:{referrer:'https://example.com/?phone=01099999999',addEventListener(){},createElement(){return {};},head:{appendChild:s=>scripts.push(s.src)}},addEventListener:(name,fn)=>handlers[name]=fn,fetch:async url=>{requests.push(url);return {json:async()=>({gaMeasurementId:'G-ABCDEF1234'})};}};
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
 const campaign='utm_source=google&utm_medium=cpc&utm_campaign=azit_purchase_kr_m40_70_v1&utm_content=search_ai';
 const tagged=await run('granted','/','0','?'+campaign+'&phone=01099999999&gclid=private-click&fbclid=private-meta&utm_term=private-query');
 const taggedCalls=tagged.context.dataLayer.map(x=>Array.from(x));
 assert.equal(taggedCalls.find(x=>x[0]==='config')[2].page_location,'https://azitchat.com/?'+campaign);
 for(const secret of ['01099999999','private-click','private-meta','private-query'])assert(!JSON.stringify(taggedCalls).includes(secret));
 for(const query of [campaign.replace('search_ai','01099999999'),campaign.replace('google','__proto__'),campaign.replace('cpc','email'),campaign.replace('azit_purchase_kr_m40_70_v1','customer_01099999999')]){
  const invalid=await run('granted','/','0','?'+query);assert.equal(invalid.context.dataLayer.find(x=>x[0]==='config')[2].page_location,'https://azitchat.com/');
 }
 for(const source of ['facebook','instagram']){
  const social=await run('granted','/','0','?'+campaign.replace('google',source).replace('cpc','paid_social').replace('search_ai','meta_conversation'));
  assert(new URL(social.context.dataLayer.find(x=>x[0]==='config')[2].page_location).searchParams.get('utm_source')===source);
 }
 for(const [consent,dnt,tester] of [['denied','0',false],['granted','1',false],['granted','0',true]]){
  const excluded=await run(consent,'/',dnt,'?'+campaign,tester);assert.equal(excluded.scripts.length,0);assert.equal(excluded.requests.length,0);
 }
 console.log('PASS: GA consent/DNT/admin exclusion, explicit event whitelist, sanitized URL/referrer and no customer identifiers');
})().catch(e=>{console.error(e);process.exitCode=1;});
