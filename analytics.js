(()=>{'use strict';
// Only explicitly named product actions are sent; never attach account or message data.
const allowed=new Set(['chat_message_sent','match_started','phone_verified','phone_login','gift_sent','support_created','open_charge']);
let ready=false,measurementId='',queue=[];
const choiceKey='azit_analytics_consent';
function event(name){if(!allowed.has(name)||localStorage.getItem(choiceKey)!=='granted')return;if(ready)window.gtag('event',name,{send_to:measurementId});else if(queue.length<30)queue.push(name);}
window.AzitAnalytics={event};
if(location.pathname!=='/'&&location.pathname!=='/index.html')return;
async function enable(){if(ready||localStorage.getItem(choiceKey)!=='granted'||navigator.doNotTrack==='1')return;
 try{const config=await(await fetch('/api/public-config')).json();if(!/^G-[A-Z0-9]{6,20}$/.test(config.gaMeasurementId||''))return;measurementId=config.gaMeasurementId;
 window.dataLayer=window.dataLayer||[];window.gtag=function(){window.dataLayer.push(arguments);};
 window.gtag('consent','default',{analytics_storage:'granted',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});
 window.gtag('js',new Date());
 let referrer='';try{referrer=new URL(document.referrer).origin;}catch{}
 window.gtag('config',measurementId,{send_page_view:false,allow_google_signals:false,allow_ad_personalization_signals:false,page_location:location.origin+'/',page_referrer:referrer,page_title:'아지트챗',cookie_flags:'SameSite=Lax;Secure'});
 window.gtag('event','page_view',{page_location:location.origin+'/',page_referrer:referrer,page_title:'아지트챗',send_to:measurementId});
 const script=document.createElement('script');script.async=true;script.src='https://www.googletagmanager.com/gtag/js?id='+measurementId;document.head.appendChild(script);ready=true;queue.splice(0).forEach(event);
 }catch{/* Analytics must never interrupt chat. */}}
function consent(){let panel=document.getElementById('analyticsConsent');if(panel){panel.hidden=false;return;}
 panel=document.createElement('section');panel.id='analyticsConsent';panel.setAttribute('aria-label','쿠키 사용 설정');panel.style.cssText='position:fixed;bottom:16px;left:16px;right:16px;max-width:460px;margin:auto;z-index:99999;background:#fffdf7;border:1px solid #ded8c8;padding:18px;border-radius:16px;box-shadow:0 10px 40px #0002;font:14px/1.7 sans-serif;color:#243c30';panel.innerHTML='<strong style="font-size:16px">쿠키 사용에 동의하시겠어요?</strong><p style="margin:8px 0 12px">허용하시면 분석용 쿠키를 사용해 Google Analytics로 방문·기능 이용을 살펴봐요. 전화번호와 대화·문의 내용은 보내지 않아요. 허용하지 않아도 모든 기능을 이용할 수 있고, ‘쿠키 설정’에서 언제든 바꿀 수 있어요.</p><div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap"><button type="button" data-choice="granted" style="min-height:44px;flex:1;padding:10px 18px;font:inherit;font-weight:700;background:#245d48;color:#fff;border:0;border-radius:10px;cursor:pointer">쿠키 허용</button><button type="button" data-choice="denied" style="min-height:44px;min-width:88px;padding:10px 8px;font:inherit;background:transparent;color:#536158;border:0;text-decoration:underline;text-underline-offset:3px;cursor:pointer">허용 안 함</button></div>';
 panel.querySelectorAll('button').forEach(b=>b.onclick=()=>{const previous=localStorage.getItem(choiceKey);localStorage.setItem(choiceKey,b.dataset.choice);panel.hidden=true;if(b.dataset.choice==='granted')enable();else if(previous==='granted'&&ready){window['ga-disable-'+measurementId]=true;window.gtag('consent','update',{analytics_storage:'denied'});location.reload();}});document.body.appendChild(panel);
}
document.addEventListener('click',e=>{if(e.target.closest('[data-analytics-preferences]'))consent();if(e.target.closest('#btnOpenPaymentFooter,#btnOpenPaymentListFooter'))event('open_charge');});
window.addEventListener('azit-product-event',e=>event(e.detail));
if(sessionStorage.getItem('azit_support_submitted')==='1'){sessionStorage.removeItem('azit_support_submitted');event('support_created');}
if(!localStorage.getItem(choiceKey)&&navigator.doNotTrack!=='1')consent();else enable();
})();
