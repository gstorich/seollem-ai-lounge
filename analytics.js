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
 panel=document.createElement('section');panel.id='analyticsConsent';panel.setAttribute('aria-label','방문 분석 선택');panel.style.cssText='position:fixed;bottom:16px;left:16px;right:16px;max-width:460px;margin:auto;z-index:99999;background:#fffdf7;border:1px solid #ded8c8;padding:18px;border-radius:16px;box-shadow:0 10px 40px #0002;font:14px/1.7 sans-serif;color:#243c30';panel.innerHTML='<strong>더 편한 아지트챗을 위한 방문 분석</strong><p style="margin:8px 0 12px">동의하면 Google Analytics로 방문·기능 이용을 분석합니다. 전화번호·대화·문의 내용은 전송하지 않습니다. 동의하지 않아도 모든 기능을 이용할 수 있습니다.</p><div style="display:flex;gap:8px"><button type="button" data-choice="granted" style="padding:8px 14px;background:#245d48;color:#fff;border:0;border-radius:8px">분석 허용</button><button type="button" data-choice="denied" style="padding:8px 14px;background:#eee;border:0;border-radius:8px">허용 안 함</button></div>';
 panel.querySelectorAll('button').forEach(b=>b.onclick=()=>{const previous=localStorage.getItem(choiceKey);localStorage.setItem(choiceKey,b.dataset.choice);panel.hidden=true;if(b.dataset.choice==='granted')enable();else if(previous==='granted'&&ready){window['ga-disable-'+measurementId]=true;window.gtag('consent','update',{analytics_storage:'denied'});location.reload();}});document.body.appendChild(panel);
}
document.addEventListener('click',e=>{if(e.target.closest('[data-analytics-preferences]'))consent();if(e.target.closest('#btnOpenPaymentFooter,#btnOpenPaymentListFooter'))event('open_charge');});
window.addEventListener('azit-product-event',e=>event(e.detail));
if(sessionStorage.getItem('azit_support_submitted')==='1'){sessionStorage.removeItem('azit_support_submitted');event('support_created');}
if(!localStorage.getItem(choiceKey)&&navigator.doNotTrack!=='1')consent();else enable();
})();
