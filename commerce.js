(()=>{'use strict';
const $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels={pending:'승인 확인 대기',paid:'결제 완료',partially_refunded:'부분 환불',refunded:'환불 완료',cancelled_before_credit:'지급 전 취소',failed:'결제 실패',ready:'결제 대기'};
const refundReasons={REFUND_PURCHASE_USED:'해당 구매분 사용으로 일반 환불 불가',REFUND_WINDOW_EXPIRED:'7일 경과로 일반 환불 불가',REFUND_DATE_UNCONFIRMED:'구매 시각 확인 필요'};
const identityIntent=new URLSearchParams(location.search).get('intent')==='identity'||location.hash==='#identity'||location.pathname==='/verification/complete';
const ordersIntent=new URLSearchParams(location.search).get('intent')==='orders'||location.hash==='#ordersSection'||location.pathname==='/payment/complete';
let cfg,identityCfg,packages={},busy=false,identityAvailable=false,paymentAvailable=false;
const request=(...args)=>ApiClient.request(...args);
const entryIds={payment:'entry_'+crypto.randomUUID(),identity:'entry_'+crypto.randomUUID()};
function entry(flow,stage){event(flow,entryIds[flow],stage);}
function event(flow,flowId,stage){request('/'+flow+'/events','POST',{flowId,stage}).catch(()=>{});}
async function sdk(src,key){if(window[key])return window[key];await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=src;s.onload=resolve;s.onerror=()=>reject(Error('결제 모듈을 불러오지 못했습니다.'));document.head.appendChild(s);});if(!window[key])throw Error('결제 모듈을 확인하지 못했습니다.');return window[key];}
async function action(fn){if(busy)return;busy=true;$('error').textContent='';for(const id of ['pay','identify','refresh'])$(id).disabled=true;try{await fn();}catch(e){$('error').textContent=e.message||'처리하지 못했습니다.';}finally{busy=false;for(const id of ['pay','identify','refresh'])$(id).disabled=false;$('identify').disabled=!identityAvailable;$('pay').disabled=!paymentAvailable;}}
function showIdentity(d){if(d.testAccess){identityAvailable=false;$('identify').disabled=true;$('identify').textContent='테스트 권한 적용 중';$('identityStatus').textContent='임시 성인 기능 테스트 중 · 기관 인증 아님 · '+new Date(d.testAccess.expiresAt).toLocaleString('ko-KR')+'까지';return;}if(d.isAdult){identityAvailable=false;$('identify').disabled=true;$('identify').textContent='성인인증 완료';}$('identityStatus').textContent=d.verified?(d.isAdult?'본인확인·성인 여부 확인 완료':'본인확인 완료 · 성인 확인 대상이 아닙니다'):'아직 본인확인하지 않았습니다.';}
async function orders(){if(identityIntent)return;window.AzitAdvertising?.drain();const d=await request('/payment/orders');$('orders').innerHTML=d.orders.length?d.orders.map(o=>`<article class="card"><h3>${esc(o.name)}</h3><p>${new Date(o.createdAt).toLocaleString('ko-KR')} · ${o.price.toLocaleString()}원</p><p>${esc(labels[o.status]||o.status)}${o.refundPending?' · 환불 결과 확인 중':''}${o.reviewRequired?' · 고객센터 확인 필요':''}</p><p>미사용 유료 하트 ${o.remainingPaidHearts.toLocaleString()} · 환불 가능 금액 ${o.refundableAmount.toLocaleString()}원</p>${o.refundDeadline?`<p class="muted">일반 환불 신청 기한: ${new Date(o.refundDeadline).toLocaleString('ko-KR')} · 해당 구매분 전량 미사용 조건</p>`:''}${!o.refundPending&&refundReasons[o.refundIneligibleReason]?`<p class="muted">${esc(refundReasons[o.refundIneligibleReason])} · <a href="/support">법정 환급 문의</a></p>`:''}<div class="row"><button data-check="${esc(o.id)}">결과 확인</button>${o.refundableAmount>0&&!o.refundPending?`<button data-refund="${esc(o.id)}">전액 환불</button>`:''}</div><p class="muted">주문 ${esc(o.id)}</p></article>`).join(''):'<p class="muted">결제 내역이 없습니다.</p>';
 for(const b of document.querySelectorAll('[data-check]'))b.onclick=()=>action(async()=>{await request('/payment/verify','POST',{orderId:b.dataset.check});await orders();});
 for(const b of document.querySelectorAll('[data-refund]'))b.onclick=()=>action(async()=>{if(!confirm('이 주문의 미사용 유료 하트 전량을 회수하고 결제금액 전액을 환불하시겠습니까? 환불 요청 중인 하트는 사용할 수 없습니다.'))return;try{await request('/payment/orders/'+b.dataset.refund+'/refund','POST',{});}finally{await orders();}});
}
function price(){const p=packages[$('package').value];$('price').textContent=p?p.price.toLocaleString()+'원 · '+p.hearts.toLocaleString()+'하트':'';}
$('package').onchange=price;$('refresh').onclick=()=>action(orders);
$('pay').onclick=()=>action(async()=>{
 if(!paymentAvailable)throw Error('휴대폰 번호 연결 및 결제 서비스 개통 후 이용할 수 있습니다.');
 if(!$('purchaseConsent').checked){entry('payment','confirmation_required');throw Error('상품과 환불 조건을 먼저 확인해주세요.');}
 const buyerName=$('buyerName').value.trim();if(!buyerName)throw Error('결제자 이름을 입력해주세요.');
 try{await window.AzitAdvertising?.sync();}catch{/* Measurement must not block payment. */}
 const prepared=await request('/payment/prepare','POST',{pkgKey:$('package').value,purchaseConfirmed:true});
 window.AzitAdvertising?.drain();
 sessionStorage.setItem('azit-pending-payment',prepared.order.id);
 $('notice').textContent='이니시스 결제창에서 결제를 진행해주세요. 결과가 늦어지면 결제 내역에서 확인할 수 있습니다.';
 let module;try{module=await sdk('https://cdn.portone.io/v2/browser-sdk.js','PortOne');}catch(e){event('payment',prepared.order.id,'sdk_error');throw e;}
 event('payment',prepared.order.id,'sdk_opened');
 let result;try{result=await module.requestPayment({...prepared.request,customer:{...prepared.request.customer,fullName:buyerName}});}catch(e){event('payment',prepared.order.id,'sdk_error');throw e;}
 event('payment',prepared.order.id,result?.code?(/CANCEL/i.test(result.code)?'sdk_cancelled':'sdk_error'):'sdk_returned');
 // The SDK callback or redirect cannot authorize credit; the server checks the provider.
 const d=await request('/payment/verify','POST',{orderId:prepared.order.id});
 sessionStorage.removeItem('azit-pending-payment');await orders();
 if(d.order.status==='paid')$('notice').textContent='결제가 확인되어 '+d.order.hearts.toLocaleString()+'하트가 지급됐습니다.';
 else if(result?.code)throw Error(result.message||'결제를 완료하지 않았습니다. 결제 내역에서 결과를 확인해주세요.');
 else $('notice').textContent='결제 결과를 확인 중입니다. 다시 결제하지 말고 결제 내역의 결과 확인을 이용해주세요.';
});
$('identify').onclick=()=>action(async()=>{if(!identityAvailable)throw Error('휴대폰 번호 연결 및 인증 서비스 개통 후 이용할 수 있습니다.');const prepared=await request('/identity/prepare','POST',{});let module;try{module=await sdk('https://cdn.portone.io/v2/browser-sdk.js','PortOne');}catch(e){event('identity',prepared.identityVerificationId,'sdk_error');throw e;}event('identity',prepared.identityVerificationId,'sdk_opened');let result;try{result=await module.requestIdentityVerification(prepared);}catch(e){event('identity',prepared.identityVerificationId,'sdk_error');throw e;}event('identity',prepared.identityVerificationId,result?.code?(/CANCEL/i.test(result.code)?'sdk_cancelled':'sdk_error'):'sdk_returned');if(!result)throw Error('본인확인 결과를 받지 못했습니다.');if(result.code!==undefined)throw Error(result.message||'본인확인을 완료하지 않았습니다.');const d=await request('/identity/complete','POST',{identityVerificationId:prepared.identityVerificationId});showIdentity(d);});
(async()=>{try{const connected=await ApiClient.checkBackendHealth();if(!connected)throw Error('서버에 연결할 수 없습니다.');const account=await ApiClient.loadState();[cfg,identityCfg]=await Promise.all([request('/payment/config'),request('/identity/config')]);packages=(await request('/payment/packages')).packages;
 $('package').innerHTML=Object.values(packages).map(p=>`<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');const params=new URLSearchParams(location.search),selected=params.get('package');if(Object.hasOwn(packages,selected))$('package').value=selected;price();
 window.dispatchEvent(new Event('azit-ad-account-ready'));const member=Boolean(account.user.phone);
 const selectedPackage=Object.hasOwn(packages,selected)?selected:null;
 $('connectPhone').onclick=()=>{entry(identityIntent?'identity':'payment','phone_required');sessionStorage.setItem('azit-commerce-return','/billing'+(selectedPackage?'?package='+encodeURIComponent(selectedPackage):'')+(identityIntent?'#identity':'#checkout'));};
 entry(identityIntent?'identity':'payment','entry_viewed');
 if(!member)entry(identityIntent?'identity':'payment','phone_required');
 $('ordersSection').hidden=identityIntent;
 if(identityIntent){document.body.classList.add('identity-only');$('title').textContent='성인인증 · 내 인증 상태';$('ordersSection').hidden=true;}
$('account').hidden=member;$('checkout').hidden=identityIntent||ordersIntent;paymentAvailable=member&&cfg.enabled;$('pay').disabled=!paymentAvailable;$('pay').textContent=!member?'번호 연결 후 카드 결제':!cfg.enabled?'카드 결제 개통 준비 중':'이니시스로 카드 결제';$('checkoutStatus').textContent=!member?'휴대폰 번호 연결 후 결제할 수 있습니다. 처음 연결하면 100하트를 받습니다.':!cfg.enabled?'KG이니시스 심사·개통을 준비하고 있습니다. 현재 결제 요청이나 유료 하트 지급은 발생하지 않습니다.':'KG이니시스 카드 결제로 안전하게 충전하세요.';$('identity').hidden=!identityIntent;identityAvailable=member&&identityCfg.enabled;$('identify').disabled=!identityAvailable;$('identify').textContent=!member?'휴대폰 번호 연결 후 성인인증':!identityCfg.enabled?'성인인증 서비스 개통 준비 중':'만 19세 이상 성인인증 시작';$('notice').textContent=cfg.enabled?(cfg.mode==='test'?'테스트 환경입니다. 운영 결제가 아닙니다.':'승인된 카드 결제 서비스를 이용할 수 있습니다.'):'실결제 서비스는 준비 중입니다. 결제와 유료 하트 지급은 발생하지 않습니다.';
 if(!ordersIntent&&!(identityIntent?identityCfg.enabled:cfg.enabled))entry(identityIntent?'identity':'payment','service_unavailable');
 if(identityIntent){$('notice').textContent=identityCfg.enabled?'기관의 본인확인 결과로 만 19세 이상 여부를 확인합니다.':'성인인증은 개통 준비 중입니다. 현재 인증 요청이나 비용은 발생하지 않습니다.';const accountHelp=$('account').querySelector?.('p');if(accountHelp)accountHelp.textContent='먼저 휴대폰 번호로 로그인한 뒤 같은 번호로 성인인증을 진행해주세요. 문자 로그인만으로 성인인증이 완료되지는 않습니다.';}
 if(!identityIntent&&!ordersIntent)$('title').textContent='하트 충전';
 if(ordersIntent)$('title').textContent='결제 내역 · 환불';
 if(!identityCfg.enabled)$('identityStatus').textContent='KG이니시스 통합인증 심사·개통을 준비 중입니다. 아직 인증기관 창을 열 수 없습니다. 인증 전에는 성인 제한 기능을 이용할 수 없습니다.';
 const orderId=params.get('orderId')||params.get('paymentId')||params.get('merchant_uid')||sessionStorage.getItem('azit-pending-payment'),imp=params.get('imp_uid'),identityId=params.get('identityVerificationId');
 // Return query values never prove payment or identity; authenticated server GETs do.
 if(!identityIntent&&member&&orderId&&/^azit_[a-f0-9]{32}$/.test(orderId)){event('payment',orderId,'return_received');try{const checked=await request('/payment/verify','POST',{orderId,...(imp?{impUid:imp}:{})});$('notice').textContent=checked.order.status==='paid'?'결제가 확인되어 하트가 지급됐습니다.':'결제 결과를 확인 중입니다. 결제 내역에서 다시 확인해주세요.';sessionStorage.removeItem('azit-pending-payment');}catch(e){$('error').textContent=e.message;}}
 if(member&&identityId){event('identity',identityId,'return_received');try{showIdentity(await request('/identity/complete','POST',{identityVerificationId:identityId}));}catch(e){$('error').textContent=e.message;}}else if(member){const state=await request('/identity/status');if(state.verified||state.testAccess||identityCfg.enabled)showIdentity(state);}
 await orders();
 if(identityIntent)(member?$('identity'):$('account')).scrollIntoView?.({block:'start'});
 else if(ordersIntent)$('ordersSection').scrollIntoView?.({block:'start'});
 }catch(e){$('error').textContent=e.message;}})();
})();
