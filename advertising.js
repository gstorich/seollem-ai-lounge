(()=>{'use strict';
const key='azit_ads_consent',allowedPaths=new Set(['/','/index.html','/billing','/payment/complete','/products']);
if(!allowedPaths.has(location.pathname))return;
const excluded=()=>navigator.doNotTrack==='1'||localStorage.getItem('azit_tester')==='1'||/(?:^|;\s*)(?:azit_tester=1|(?:__Host-)?azit_admin=)/.test(document.cookie||'');
const granted=()=>!excluded()&&localStorage.getItem(key)==='granted';
let cfg,started=false,loading,busy=false,syncing;
const pageKey=crypto.randomUUID(),jobs=[],pageSeen=new Set();
async function track(name,key=crypto.randomUUID()){
 if(!granted()||!['page_view','view_pricing'].includes(name))return;
 if(!jobs.some(j=>j.key===key))jobs.push({name,key});
 await sendJobs();
}
let sendingJobs=false;
async function sendJobs(){
 if(sendingJobs||!granted()||!window.ApiClient?.isConnected()||!ApiClient.user)return;sendingJobs=true;
 try{while(jobs.length&&granted()){await sync();await ApiClient.request('/advertising/event','POST',jobs[0],{keepalive:true});jobs.shift();}await drain();}catch{/* Retried with the same key on readiness/online/timer. */}finally{sendingJobs=false;}
}
const query=new URLSearchParams(location.search),click={},clickAt=Date.now();
for(const name of ['gclid','gbraid','wbraid','fbclid']){const v=query.get(name);if(v&&v.length<=256&&/^[A-Za-z0-9_.~-]+$/.test(v))click[name]=v;}
function cookie(name){return document.cookie.split(';').map(s=>s.trim()).find(s=>s.startsWith(name+'='))?.slice(name.length+1);}
async function sync(){
 if(!window.ApiClient?.isConnected()||!ApiClient.user)return;
 if(syncing)return syncing;
 syncing=(async()=>{
 const c={granted:granted()};
 if(c.granted){
  Object.assign(c,click);delete c.fbclid;
  if(click.fbclid)c.fbc='fb.1.'+clickAt+'.'+click.fbclid;
  else c.fbc=cookie('_fbc');c.fbp=cookie('_fbp');
  if(query.get('utm_campaign')==='azit_purchase_kr_m50_69_v3')c.campaign='azit_purchase_kr_m50_69_v3';
 }
 await ApiClient.request('/advertising/context','PUT',c,{signal:AbortSignal.timeout(5000)});
 })().finally(()=>{syncing=null;});return syncing;
}
function safePixelPage(){return ['/','/index.html','/billing','/products'].includes(location.pathname)&&[...query.keys()].every(k=>['utm_source','utm_medium','utm_campaign','utm_content','gclid','gbraid','wbraid','fbclid'].includes(k))&&[...query.values()].every(v=>/^[A-Za-z0-9_.~-]{1,256}$/.test(v));}
async function start(){
 if(!granted())return;if(loading)return loading;
 loading=(async()=>{
 if(location.pathname==='/products'&&!ApiClient.user)await ApiClient.checkBackendHealth();
 cfg=(await(await fetch('/api/public-config')).json()).advertising||{};
 if(!granted()){loading=null;return;}
 const newTag=!window.gtag;window.dataLayer=window.dataLayer||[];window.gtag=window.gtag||function(){window.dataLayer.push(arguments);};
 if(newTag)window.gtag('consent','default',{analytics_storage:'denied',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});
 window.gtag('consent','update',{ad_storage:'granted',ad_user_data:'granted',ad_personalization:'denied'});
 window.gtag('set',{page_location:location.origin+location.pathname,page_referrer:'',page_title:'아지트챗'});
 if(/^AW-\d+$/.test(cfg.googleAdsId)){
  window.gtag('config',cfg.googleAdsId,{send_page_view:false,allow_enhanced_conversions:false,page_location:location.origin+location.pathname,page_referrer:'',page_title:'아지트챗'});
  if(!document.querySelector('script[src^="https://www.googletagmanager.com/gtag/js"]')){window.gtag('js',new Date());const s=document.createElement('script');s.async=true;s.src='https://www.googletagmanager.com/gtag/js?id='+cfg.googleAdsId;document.head.appendChild(s);}
 }
 if(/^\d+$/.test(cfg.metaPixelId)&&safePixelPage()){
  if(!window.fbq){const f=window.fbq=function(){f.callMethod?f.callMethod.apply(f,arguments):f.queue.push(arguments);};f.queue=[];f.loaded=true;f.version='2.0';window._fbq=f;
   f('set','autoConfig',false,cfg.metaPixelId);f('init',cfg.metaPixelId);f('consent','grant');
   const s=document.createElement('script');s.async=true;s.src='https://connect.facebook.net/en_US/fbevents.js';s.onload=()=>sync().then(drain).catch(()=>{});document.head.appendChild(s);
  }
 }
 started=true;await sync();if(!pageSeen.has(pageKey)){pageSeen.add(pageKey);jobs.push({name:'page_view',key:pageKey});if(['/billing','/products'].includes(location.pathname))jobs.push({name:'view_pricing',key:crypto.randomUUID()});}await sendJobs();await drain();
 })().catch(()=>{loading=null;});return loading;
}
async function drain(){
 if(busy||!started||!granted()||!window.ApiClient?.isConnected()||!ApiClient.user)return;busy=true;
 try{const d=await ApiClient.request('/advertising/pending'),callbacks=[];for(const e of d.events){
  if(!granted())break;
  const p={value:e.value??0,currency:'KRW',transaction_id:e.transaction_id||e.id,page_location:location.origin+'/',page_referrer:'',page_title:'아지트챗'};
  const spec=cfg.events?.[e.name]||(e.name==='purchase'?{googleLabel:cfg.googlePurchaseLabel,meta:'Purchase'}:{});
  if(e.destination==='google_browser'&&/^AW-\d+$/.test(cfg.googleAdsId)&&/^[\w-]+$/.test(spec.googleLabel||'')){
   // Ack only from tag callback. Blockers leave the durable event pending for another visit.
   callbacks.push(new Promise(resolve=>{const t=setTimeout(resolve,5000);gtag('event','conversion',{...p,send_to:cfg.googleAdsId+'/'+spec.googleLabel,event_callback:()=>{ApiClient.request('/advertising/ack','POST',{id:e.id,destination:e.destination}).catch(()=>{});clearTimeout(t);resolve();}});}));
  }else if(e.destination==='meta_browser'&&window.fbq?.callMethod&&spec.meta){
   fbq(spec.custom?'trackCustom':'track',spec.meta,{...(e.value!==undefined?{value:e.value??0,currency:'KRW'}:{})},{eventID:e.id});
   // fbq has no receipt callback: keep a truthful dispatch status, not a delivery claim.
   await ApiClient.request('/advertising/ack','POST',{id:e.id,destination:e.destination});
  }
 }await Promise.all(callbacks);}catch{/* Durable server queue remains available. */}finally{busy=false;}
}
window.AzitAdvertising={sync,drain,track};
const priceModal=document.getElementById('paymentModal');if(priceModal){let wasVisible=!priceModal.classList.contains('hidden');new MutationObserver(()=>{const visible=!priceModal.classList.contains('hidden');if(visible&&!wasVisible)track('view_pricing').catch(()=>{});wasVisible=visible;}).observe(priceModal,{attributes:true,attributeFilter:['class']});}

window.addEventListener('azit-account-ready',()=>start().then(()=>sync()).then(sendJobs).then(drain).catch(()=>{}));
window.addEventListener('azit-ad-account-ready',()=>start().then(()=>sync()).then(sendJobs).then(drain).catch(()=>{}));
window.addEventListener('azit-product-event',e=>{if(['chat_message_sent','phone_verified','phone_login'].includes(e.detail))start().then(()=>sync()).then(sendJobs).then(drain).catch(()=>{});});
window.addEventListener('online',()=>sync().then(sendJobs).then(drain).catch(()=>{}));
window.addEventListener('azit-consent-change',()=>{
 if(granted()){if(window.fbq)fbq('consent','grant');if(window.gtag)gtag('consent','update',{ad_storage:'granted',ad_user_data:'granted',ad_personalization:'denied'});start().then(()=>sync()).then(sendJobs).then(drain).catch(()=>{});}else{jobs.splice(0);for(const k of Object.keys(click))delete click[k];for(const raw of document.cookie.split(';')){const name=raw.split('=')[0].trim();if(!/^_(?:gcl|fbp|fbc)/.test(name))continue;document.cookie=name+'=; Max-Age=0; path=/; Secure; SameSite=Lax';const parts=location.hostname.split('.');for(let i=0;i<parts.length-1;i++)document.cookie=name+'=; Max-Age=0; path=/; domain=.'+parts.slice(i).join('.')+'; Secure; SameSite=Lax';}if(window.fbq)fbq('consent','revoke');if(window.gtag)gtag('consent','update',{ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});sync().catch(()=>{});}
});
window.addEventListener('storage',e=>{if(e.key===key)window.dispatchEvent(new Event('azit-consent-change'));});
const timer=setInterval(()=>{if(granted())start().then(sendJobs).then(drain);},30000);window.addEventListener('pagehide',()=>clearInterval(timer));
if(granted())start();else if(!excluded()&&localStorage.getItem(key)===null&&localStorage.getItem('azit_analytics_consent'))window.AzitAnalytics?.preferences?.();
})();
