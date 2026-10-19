(()=>{'use strict';
const $=id=>document.getElementById(id),esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=value=>Number(value||0).toLocaleString('ko-KR',{maximumFractionDigits:1}),date=value=>value?new Date(value).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}):'-';
const labels={open:'접수',in_progress:'처리 중',answered:'답변 완료',closed:'종료',account:'계정·인증',hearts:'하트',chat:'대화',payment:'결제',other:'기타'};
let view='overview',page=0,query='',status='all',chatKind='all',engagement='all',chatCharacter='';
async function api(route,method='GET',body){const r=await fetch('/api/admin'+route,{method,credentials:'same-origin',headers:{'Content-Type':'application/json','X-Azit-Admin':'1'},...(body===undefined?{}:{body:JSON.stringify(body)})});let d;try{d=await r.json();}catch{d={error:'요청을 처리하지 못했습니다.'};}if(!r.ok){if(r.status===401&&route!=='/session')showLogin();throw Error(d.error||'요청에 실패했습니다.');}return d;}
function showLogin(){$('login').hidden=false;$('app').hidden=true;if($('detail').open)$('detail').close();$('content').replaceChildren();}
async function load(){ $('error').textContent='';$('content').innerHTML='<p class="loading">불러오는 중…</p>';try{await render();}catch(e){$('error').textContent=e.message;$('content').replaceChildren();}}
function pager(total,size){return `<div class="pager"><button id="previous" ${page===0?'disabled':''}>이전</button><span class="muted">${page+1} 페이지 · ${fmt(total)}건</span><button id="next" ${(page+1)*size>=total?'disabled':''}>다음</button></div>`;}
function bindPager(){if($('previous'))$('previous').onclick=()=>{page--;load();};if($('next'))$('next').onclick=()=>{page++;load();};}
async function render(){
 if(view==='commerce'){
  const d=await api('/commerce?page='+page);
  $('content').innerHTML=`<section class="card"><h2>결제·환불 운영</h2><p>확인된 결제 ${fmt(d.totals.gross)}원 · 취소 ${fmt(d.totals.refunded)}원</p><p>카드 결제 ${d.paymentEnabled?'활성':'준비 중'} · 본인확인 ${d.identityEnabled?'활성':'준비 중'} · ${esc(d.mode)} 모드</p><p class="muted">구매 후 7일 이내이며 해당 구매분이 전량 미사용인 주문만 전액 환불합니다. 법정 환급 예외는 고객센터에서 별도 검토합니다. 결과 확인 중인 환불은 하트를 보류하고 중복 취소하지 않습니다. 확인 필요 건은 PG 취소 내역을 확인한 뒤 고객센터에서 안내하세요.</p></section><section class="card"><div class="table-scroll"><table><thead><tr><th>주문·고객</th><th>상품·금액</th><th>상태</th><th>미사용·환불</th><th>처리</th></tr></thead><tbody>${d.items.map(o=>`<tr><td>${esc(o.id)}<br>${esc(o.userId)}</td><td>${esc(o.name)}<br>${fmt(o.price)}원</td><td>${esc(o.status)}${o.refundPending?' · 환불 확인 중':''}${o.reviewRequired?' · 확인 필요':''}</td><td>${fmt(o.remainingPaidHearts)}하트<br>${fmt(o.refundableAmount)}원</td><td><button data-payment-check="${esc(o.id)}">결과 확인</button>${o.refundableAmount>0&&!o.refundPending?`<button data-payment-refund="${esc(o.id)}">전액 환불</button>`:''}</td></tr>`).join('')}</tbody></table></div>${pager(d.total,30)}</section>`;
  bindPager();document.querySelectorAll('[data-payment-check]').forEach(b=>b.onclick=async()=>{try{b.disabled=true;await api('/commerce/'+b.dataset.paymentCheck+'/check','POST',{});await load();}catch(e){$('error').textContent=e.message;b.disabled=false;}});
  document.querySelectorAll('[data-payment-refund]').forEach(b=>b.onclick=async()=>{if(!confirm('이 주문의 미사용 유료 하트를 환불할까요? 실제 PG 취소가 요청됩니다.'))return;try{b.disabled=true;await api('/commerce/'+b.dataset.paymentRefund+'/refund','POST',{});await load();}catch(e){$('error').textContent=e.message;b.disabled=false;}});return;
 }

 if(view==='overview'){
  const d=await api('/overview?days='+$('days').value),t=d.totals;
  const stats=[['전체 계정',t.customers,'인증 회원 + 게스트'],['휴대폰 인증 회원',t.members,'현재 보관 중인 인증 계정'],['게스트 세션',t.guests,'사람 수와 다릅니다 · 별도 목록에서 확인'],['대화한 게스트',t.engagedGuests,'사용자 메시지가 1개 이상'],['미사용 게스트',t.unusedGuests,'사용자 메시지가 없는 세션'],['기간 내 대화',t.chatTurns,'하트 차감이 발생한 대화'],['미처리 문의',t.openTickets,'접수 + 처리 중'],['활동 계정',t.activeAccounts,'기간 내 대화·재연결 사용'],['기간 내 신규 계정',t.newAccounts,'현재 남아 있는 계정 기준'],['보유 하트 총합',t.hearts,'현재 전체 계정 잔액']];
  $('content').innerHTML=`<div class="grid">${stats.map(([title,note,sub])=>`<div class="card"><div class="card-title">${title}</div><div class="stat">${fmt(note)}</div><small>${sub}</small></div>`).join('')}</div><div class="split"><section class="card"><h2>일별 대화 추이</h2><div class="bars">${d.daily.length?d.daily.map(x=>`<div class="bar" style="height:${Math.max(2,x.chatTurns/Math.max(...d.daily.map(v=>v.chatTurns))*100)}%" title="${esc(x.day)} · ${x.chatTurns}회"></div>`).join(''):'<p class="muted">기간 내 대화가 없습니다.</p>'}</div><div class="table-scroll"><table><thead><tr><th>날짜</th><th>대화</th><th>활동 계정</th><th>사용 하트</th></tr></thead><tbody>${d.daily.slice(-14).reverse().map(x=>`<tr><td>${esc(x.day)}</td><td>${fmt(x.chatTurns)}</td><td>${fmt(x.activeAccounts)}</td><td>${fmt(x.heartsUsed)}</td></tr>`).join('')}</tbody></table></div></section><section class="card"><h2>서비스 상태</h2><p><span class="pill">운영 중</span></p><p>대화 모델 <strong>${esc(d.runtime.model)}</strong></p><p>문자 인증 <strong>${d.runtime.smsConfigured?'연결됨':'설정 필요'}</strong></p><p>실결제 <strong>${d.runtime.paymentEnabled?'활성':'준비 중'}</strong></p><p>Google Analytics <strong>${d.analytics.measurementId?'연결 설정됨':'측정 ID 설정 필요'}</strong></p><hr class="divider"><h3>기간 내 인증·문의</h3>${d.events.length?d.events.map(x=>`<p class="muted">${esc({phone_verified:'첫 휴대폰 인증',phone_login:'휴대폰 로그인',support_created:'문의 접수'}[x.event]||x.event)} <strong>${fmt(x.count)}</strong></p>`).join(''):'<p class="muted">기능 적용 이후부터 집계됩니다.</p>'}<div class="notice">실제 사용 지표는 서버 데이터 기준입니다. 방문자·유입 경로는 방문 분석에서 확인할 수 있습니다.</div></section></div>`;
 }else if(view==='characters'){
  await window.AzitCharacterAdmin.render({api,esc,fmt,date});
 }else if(view==='conversations'){
  await renderConversations();
 }else if(view==='insights'){
  await renderInsights();
 }else if(view==='matching'){
  await renderMatchingInsights();
 }else if(view==='customers'||view==='guests'){
  const d=await api('/customers?q='+encodeURIComponent(query)+'&page='+page+'&kind='+(view==='guests'?'guests':'members')+'&engagement='+engagement);
  $('content').innerHTML=`<section class="card"><form id="searchForm" class="row"><input id="search" placeholder="휴대폰 번호 또는 고객 ID 검색" aria-label="고객 검색" value="${esc(query)}"><button class="primary">검색</button></form><p class="muted">${view==='guests'?'게스트는 브라우저별 세션이며 실제 사람 수가 아닙니다. 비공개 창·다른 브라우저·저장소 삭제 시 별도 세션이 생길 수 있습니다.':'휴대폰 인증 회원만 표시합니다. 게스트는 별도 메뉴에서 확인하세요.'}</p><select id="engagementFilter" aria-label="대화 활동"><option value="all">전체 활동</option><option value="active" ${engagement==='active'?'selected':''}>대화한 계정</option><option value="unused" ${engagement==='unused'?'selected':''}>사용자 메시지 없음</option></select><div class="table-scroll spaced"><table><thead><tr><th>고객</th><th>구분</th><th>잔액</th><th>사용자 메시지</th><th>가입일</th><th>최근 접속</th><th></th></tr></thead><tbody>${d.items.map(x=>`<tr><td>${esc(x.phone?x.phone.replace(/(\d{3})\d{4}(\d{4})/,'$1-****-$2'):x.id)}</td><td>${x.phone?'인증 회원':'게스트'}${x.isAdult?' <span class="pill active" style="font-size:10px;padding:2px 5px;">19+</span>':''}</td><td>${fmt(x.hearts)} 하트</td><td>${fmt(x.userTurns)}</td><td>${date(x.createdAt)}</td><td>${date(x.lastSeenAt)}</td><td><button data-customer="${esc(x.id)}">관리</button></td></tr>`).join('')}</tbody></table></div>${pager(d.total,30)}</section>`;
  $('engagementFilter').onchange=()=>{engagement=$('engagementFilter').value;page=0;load();};$('searchForm').onsubmit=e=>{e.preventDefault();query=$('search').value.trim();page=0;load();};document.querySelectorAll('[data-customer]').forEach(b=>b.onclick=()=>openCustomer(b.dataset.customer));bindPager();
 }else if(view==='tickets'){
  const d=await api('/tickets?status='+status+'&page='+page);
  $('content').innerHTML=`<section class="card"><div class="row"><h2>문의함</h2><select id="statusFilter" aria-label="문의 상태"><option value="all">전체 상태</option>${['open','in_progress','answered','closed'].map(x=>`<option value="${x}" ${x===status?'selected':''}>${labels[x]}</option>`).join('')}</select></div>${d.items.length?d.items.map(x=>`<button class="ticket" data-ticket="${esc(x.id)}"><span class="pill ${x.status}">${labels[x.status]}</span> <small>${labels[x.category]} · ${date(x.updated_at)}</small><strong>${esc(x.subject)}</strong><small>문의 번호 ${esc(x.id.slice(0,8))}</small></button>`).join(''):'<div class="empty">접수된 문의가 없습니다.</div>'}${pager(d.total,30)}</section>`;
  $('statusFilter').onchange=()=>{status=$('statusFilter').value;page=0;load();};document.querySelectorAll('[data-ticket]').forEach(b=>b.onclick=()=>openTicket(b.dataset.ticket));bindPager();
 }else if(view==='funnel'){
  await window.AzitFunnelAdmin.render({api,esc,fmt,date,days:$('days').value});
 }else if(view==='analytics'){
  const d=await api('/overview?days=30'),a=d.analytics;
  $('content').innerHTML=`<div class="split"><section class="card"><h2>Google Analytics 4</h2><p class="muted">방문자, 유입 경로, 기기, 재방문을 Google Analytics 보고서에서 확인하세요.</p><a class="pill" href="https://analytics.google.com/analytics/web/${/^\d+$/.test(a.propertyId)?'#/p'+a.propertyId+'/reports/intelligenthome':''}" target="_blank" rel="noopener">Analytics 보고서 열기 ↗</a><hr class="divider"><form id="analyticsForm"><label for="measurementId">측정 ID</label><input id="measurementId" value="${esc(a.measurementId)}" placeholder="G-XXXXXXXXXX"><label for="propertyId">속성 ID</label><input id="propertyId" value="${esc(a.propertyId)}" inputmode="numeric" placeholder="숫자 속성 ID"><button class="primary spaced">설정 저장</button><p id="settingsResult" class="muted" role="status"></p></form></section><section class="card"><h2>수집하는 이벤트</h2><p class="muted">페이지 방문 · 대화 전송 성공 · 상대 매칭 · 번호 인증 완료 · 고객 문의 접수 · 충전 화면 열기</p><div class="notice">전화번호, 고객 ID, 대화 내용, 문의 내용, 관리자 화면은 Analytics로 보내지 않습니다. 고객이 분석 수집에 동의한 경우에만 태그를 불러옵니다.</div><p class="muted">실제 결제가 연결되기 전에는 구매·매출 이벤트를 보내지 않습니다. 광고 개인 최적화와 Google Signals는 비활성화되어 있습니다.</p></section></div>`;
  $('analyticsForm').onsubmit=async e=>{e.preventDefault();try{await api('/analytics','PUT',{measurementId:$('measurementId').value,propertyId:$('propertyId').value});$('settingsResult').textContent='저장했습니다. 다음 서비스 방문부터 적용됩니다.';}catch(e){$('error').textContent=e.message;}};
 }else{
  const d=await api('/audit?page='+page);
  $('content').innerHTML=`<section class="card"><h2>관리자 처리 기록</h2><p class="muted">공용 비밀번호를 사용하는 관리자 작업은 operator로 기록됩니다.</p><div class="table-scroll"><table><thead><tr><th>일시</th><th>작업</th><th>대상</th><th>상세</th></tr></thead><tbody>${d.items.map(x=>`<tr><td>${date(x.created_at)}</td><td>${esc(x.action)}</td><td>${esc(x.target)}</td><td>${esc(JSON.stringify(x.details))}</td></tr>`).join('')}</tbody></table></div>${pager(page*50+d.items.length+(d.items.length===50?1:0),50)}</section>`;bindPager();
 }
}
async function openCustomer(id){try{const {customer:c}=await api('/customers/'+encodeURIComponent(id));const chats=await api('/conversations?userId='+encodeURIComponent(id));$('detailTitle').textContent='고객 관리';$('detailError').textContent='';$('detailContent').innerHTML=`<p class="spaced"><strong>${esc(c.phone||c.id)}</strong></p><p>보유 ${fmt(c.hearts)} 하트 · 대화방 ${fmt(c.roomCount)}개 · 메시지 ${fmt(c.messageCount)}개</p><small>가입 ${date(c.createdAt)} · 마지막 저장 ${date(c.updatedAt)}</small><hr class="divider"><h3>성인 인증 관리</h3><div class="row" style="align-items:center;justify-content:space-between;gap:12px;"><div><span class="pill ${c.isAdult?'active':'guest'}">${c.isAdult?'성인 인증 완료 (19+)':'성인 미인증'}</span> <small class="muted">${c.verification?.verifiedAt?('인증일: '+date(c.verification.verifiedAt)+(c.verification.method==='admin_manual'?' (관리자 수동)':' (본인인증)')):'인증 기록 없음'}</small></div><button id="toggleAdultBtn" class="${c.isAdult?'':'primary'}">${c.isAdult?'성인 인증 해제':'성인 인증 부여'}</button></div><hr class="divider"><h3>대화 내역 (${fmt(chats.total)}개 방)</h3>${conversationTable(chats.items)}${chats.total>30?'<button id="allCustomerChats">이 고객의 모든 대화방 보기</button>':''}<hr class="divider"><h3>하트 보정</h3><p class="muted">새로 지급하는 하트는 지급 시점부터 2년간 유효합니다. 차감 시 먼저 받은 지급분부터 사용합니다.</p><form id="adjustForm"><div class="row"><input id="delta" type="number" step="0.1" min="-10000" max="10000" placeholder="지급 +10 / 차감 -10" aria-label="보정 하트" required><input id="reason" placeholder="처리 사유 (필수)" aria-label="처리 사유" minlength="3" maxlength="500" required></div><button class="primary spaced">보정 내용 확인</button></form><hr class="divider"><h3>내부 메모</h3><form id="noteForm"><textarea id="note" aria-label="고객 내부 메모" placeholder="고객에게 보이지 않는 운영 메모" maxlength="3000" required></textarea><button class="spaced">메모 저장</button></form>${c.notes.map(n=>`<div class="message internal">${esc(n.details.body)}<br><small>${date(n.created_at)}</small></div>`).join('')}<hr class="divider"><h3>하트 획득·만료 내역</h3><p class="muted">각 획득일로부터 2년 유효 · 먼저 받은 하트부터 사용됩니다. 최근 100개 지급분입니다.</p><div class="table-scroll"><table><thead><tr><th>획득</th><th>획득 하트</th><th>잔여</th><th>만료일</th><th>소멸</th></tr></thead><tbody>${(c.heartGrants||[]).map(g=>`<tr><td>${date(g.acquiredAt)}</td><td>${fmt(g.grantedHearts)}</td><td>${fmt(g.remainingHearts)}</td><td>${date(g.expiresAt)}</td><td>${fmt(g.expiredHearts)}</td></tr>`).join('')}</tbody></table></div><hr class="divider"><h3>최근 하트 내역</h3><div class="table-scroll"><table><thead><tr><th>시간</th><th>유형</th><th>변동</th></tr></thead><tbody>${c.ledger.map(x=>`<tr><td>${date(x.created_at)}</td><td>${esc(x.reason)}</td><td>${x.delta>0?'+':''}${fmt(x.delta)}</td></tr>`).join('')}</tbody></table></div>`;if(!$('detail').open)$('detail').showModal();
 bindConversations();if($('allCustomerChats'))$('allCustomerChats').onclick=()=>{query=id;chatKind='all';view='conversations';page=0;$('detail').close();$('pageTitle').textContent='전체 채팅';load();};
 $('toggleAdultBtn').onclick=async()=>{const nextState=!c.isAdult;if(!window.confirm(nextState?'이 고객에게 성인 인증(19+)을 부여할까요?\n모든 수위의 대화 제약이 해제됩니다.':'이 고객의 성인 인증을 해제할까요?'))return;try{await api('/customers/'+encodeURIComponent(id)+'/adult-verification','POST',{isAdult:nextState,reason:'관리자 화면에서 설정'});await openCustomer(id);load();}catch(e){$('detailError').textContent=e.message;}};
 let adjustment=null;
 $('adjustForm').onsubmit=async e=>{e.preventDefault();const delta=Number($('delta').value),reason=$('reason').value.trim();if(!window.confirm(`${delta>0?'+':''}${delta} 하트를 보정합니다.\n사유: ${reason}\n계속할까요?`))return;const key=JSON.stringify({delta,reason});if(!adjustment||adjustment.key!==key)adjustment={key,requestId:crypto.randomUUID()};const button=e.submitter;button.disabled=true;try{await api('/customers/'+encodeURIComponent(id)+'/hearts','POST',{delta,reason,requestId:adjustment.requestId});await openCustomer(id);load();}catch(e){$('detailError').textContent=e.message;}finally{button.disabled=false;}};
 $('noteForm').onsubmit=async e=>{e.preventDefault();try{await api('/customers/'+encodeURIComponent(id)+'/notes','POST',{body:$('note').value});openCustomer(id);}catch(e){$('detailError').textContent=e.message;}};
 }catch(e){$('error').textContent=e.message;}}
async function openTicket(id){try{const {ticket:t}=await api('/tickets/'+id);$('detailTitle').textContent=t.subject;$('detailError').textContent='';$('detailContent').innerHTML=`<div class="row spaced"><select id="ticketStatus" aria-label="처리 상태">${['open','in_progress','answered','closed'].map(x=>`<option value="${x}" ${t.status===x?'selected':''}>${labels[x]}</option>`).join('')}</select><button id="saveStatus">상태 변경</button><button id="ticketCustomer">고객 관리</button></div><small>${labels[t.category]} · ${date(t.created_at)} · ${esc(t.user_id)}</small>${t.messages.map(m=>`<div class="message ${m.internal?'internal':m.author==='admin'?'admin':''}"><small>${m.internal?'내부 메모':m.author==='admin'?'운영자 답변':'고객'} · ${date(m.created_at)}</small><br>${esc(m.body)}</div>`).join('')}<form id="replyForm"><label for="reply">문의 답변</label><textarea id="reply" maxlength="5000" required></textarea><label class="row"><input type="checkbox" id="internal" style="width:auto">내부 메모로 남기기 (고객에게 비공개)</label><button class="primary">답변 등록</button></form><p class="muted">고객은 사이트 고객센터에서 답변을 확인합니다. 문자는 자동 발송하지 않습니다.</p>`;if(!$('detail').open)$('detail').showModal();$('ticketCustomer').onclick=()=>openCustomer(t.user_id);$('saveStatus').onclick=async()=>{try{await api('/tickets/'+id,'PATCH',{status:$('ticketStatus').value});load();openTicket(id);}catch(e){$('detailError').textContent=e.message;}};$('replyForm').onsubmit=async e=>{e.preventDefault();const b=e.submitter;b.disabled=true;try{await api('/tickets/'+id+'/replies','POST',{body:$('reply').value,internal:$('internal').checked});load();openTicket(id);}catch(e){$('detailError').textContent=e.message;}finally{b.disabled=false;}};}catch(e){$('error').textContent=e.message;}}
function kindSelect(){return `<select id="chatKind" aria-label="계정 구분"><option value="all" ${chatKind==='all'?'selected':''}>인증 회원 + 게스트</option><option value="members" ${chatKind==='members'?'selected':''}>인증 회원만</option><option value="guests" ${chatKind==='guests'?'selected':''}>게스트만</option></select>`;}
function conversationTable(items){return `<div class="table-scroll"><table><thead><tr><th>고객</th><th>캐릭터</th><th>사용자 메시지</th><th>최근 대화</th><th></th></tr></thead><tbody>${items.map(x=>`<tr><td>${esc(x.phone?x.phone.replace(/(\d{3})\d{4}(\d{4})/,'$1-****-$2'):x.user_id)}<br><small>${x.phone?'인증 회원':'게스트'}</small></td><td>${esc(x.characterName)}<br><small>${esc(x.scenario)}</small></td><td>${fmt(x.userTurns)}</td><td>${date(x.lastAt)}<div class="chat-preview">${esc(x.preview)}</div></td><td><button data-chat-user="${esc(x.user_id)}" data-chat-character="${esc(x.character_id)}">채팅 보기</button></td></tr>`).join('')}</tbody></table></div>`;}
function bindConversations(){document.querySelectorAll('[data-chat-user]').forEach(b=>b.onclick=()=>openConversation(b.dataset.chatUser,b.dataset.chatCharacter,0));}
async function renderConversations(){
 const d=await api('/conversations?kind='+chatKind+'&q='+encodeURIComponent(query)+'&page='+page+'&characterId='+encodeURIComponent(chatCharacter));
 $('content').innerHTML=`<section class="card"><h2>전체 대화 기록</h2><p class="muted">인증 회원과 게스트의 서버 보관 대화를 조회합니다. 기간 제한 없이 조회하며, 사용자 화면에서 나간 방도 보관 기록이 있으면 표시됩니다. 조회 작업은 관리자 처리 기록에 남습니다.</p><form id="conversationSearch" class="row"><input id="chatSearch" aria-label="대화 검색" value="${esc(query)}" placeholder="고객 ID · 번호 · 캐릭터 · 대화 내용 검색">${kindSelect()}<button class="primary">검색</button></form>${chatCharacter?'<p class="notice">선택한 캐릭터의 대화만 표시합니다. <button id="clearCharacter">캐릭터 조건 해제</button></p>':''}${d.items.length?conversationTable(d.items):'<p class="empty">조건에 맞는 대화가 없습니다.</p>'}${pager(d.total,30)}</section>`;
 $('conversationSearch').onsubmit=e=>{e.preventDefault();query=$('chatSearch').value.trim();chatKind=$('chatKind').value;page=0;load();};$('chatKind').onchange=()=>{chatKind=$('chatKind').value;page=0;load();};if($('clearCharacter'))$('clearCharacter').onclick=()=>{chatCharacter='';page=0;load();};bindPager();bindConversations();
}
async function openConversation(userId,characterId,messagePage=0){try{
 const {conversation:c}=await api('/conversations/'+encodeURIComponent(userId)+'/'+encodeURIComponent(characterId)+'?page='+messagePage);
 $('detailTitle').textContent=c.characterName+' 대화';$('detailError').textContent='';
 $('detailContent').innerHTML=`<p><strong>${esc(c.userId)}</strong><br><small>${esc(c.scenario)} · 총 ${fmt(c.total)}개 메시지</small></p><button id="conversationCustomer">고객 관리로</button><div class="transcript">${c.messages.map(m=>`<div class="message ${m.sender==='ai'?'admin':'customer'}"><small>${m.sender==='ai'?esc(c.characterName)+' · AI':'사용자'} · ${date(m.createdAt)}</small><br>${esc(m.text||'')}${m.mediaType?'<br><small>첨부: '+esc(m.mediaType)+' · '+esc(m.photoTitle||m.giftName||m.voiceText||'')+'</small>':''}</div>`).join('')}</div><div class="pager"><button id="olderMessages" ${messagePage===0?'disabled':''}>이전 메시지</button><span>${messagePage+1} / ${Math.max(1,Math.ceil(c.total/100))}</span><button id="newerMessages" ${(messagePage+1)*100>=c.total?'disabled':''}>다음 메시지</button></div>`;
 $('conversationCustomer').onclick=()=>openCustomer(userId);$('olderMessages').onclick=()=>openConversation(userId,characterId,messagePage-1);$('newerMessages').onclick=()=>openConversation(userId,characterId,messagePage+1);if(!$('detail').open)$('detail').showModal();$('detailContent').scrollTop=0;
 }catch(e){$('error').textContent=e.message;}}
async function renderInsights(){
 const d=await api('/conversation-insights?kind='+chatKind+'&days='+$('days').value);
 const ranking=(title,rows,character=false)=>`<section class="card spaced"><h2>${title}</h2><div class="table-scroll"><table><thead><tr><th>순위 · 이름</th><th>사용자</th><th>대화방</th><th>메시지</th><th>방당 메시지</th><th>다른 날 재방문 방</th>${character?'<th></th>':''}</tr></thead><tbody>${rows.map((x,i)=>`<tr><td>${i+1}. ${esc(x.label)}${character?'<br><small>'+esc(x.gender==='male'?'남성':'여성')+' · '+esc(x.scenario)+'</small>':''}</td><td>${fmt(x.users)}</td><td>${fmt(x.rooms)}</td><td>${fmt(x.turns)}</td><td>${fmt(x.averageTurns)}</td><td>${fmt(x.returnRooms)}</td>${character?'<td><button data-insight-character="'+esc(x.key)+'">대화 보기</button></td>':''}</tr>`).join('')}</tbody></table></div>${rows.length?'':'<p class="empty">기간 내 사용자 메시지가 없습니다.</p>'}</section>`;
 $('content').innerHTML=`<section class="card"><div class="row"><h2>대화 선호·이용 분석</h2>${kindSelect()}</div><p class="muted">${esc(d.method)}</p><p>사용자 메시지 <strong>${fmt(d.totalTurns)}</strong>개 · 활동 계정 <strong>${fmt(d.activeUsers)}</strong>개 · 대화방 <strong>${fmt(d.activeRooms)}</strong>개</p>${d.truncated?'<div class="notice">최근 50,000개 사용자 메시지를 분석했습니다. 전체 기간 메시지는 '+fmt(d.totalTurns)+'개이며 아래 순위는 표본 기준입니다.</div>':''}<p class="muted">미사용 게스트와 AI의 첫 인사는 인기 집계에서 제외합니다. 게스트 수는 실제 사람 수를 뜻하지 않습니다.</p></section>${ranking('캐릭터 인기 · 사용자 메시지 순',d.characters,true)}${ranking('이용한 캐릭터 시나리오',d.scenarios)}${ranking('실제 대화 주제 · 사용자 발화 키워드',d.topics)}${ranking('대화 주제 전환 흐름 · 키워드 추정',d.flows||[])}<p class="muted">주제 전환 표의 메시지 수는 전환 발생 횟수입니다. 사용자 발화의 대표 주제가 바뀐 순서를 집계하며, 줄거리나 감정을 확정한 분석은 아닙니다.</p>`;
 $('chatKind').onchange=()=>{chatKind=$('chatKind').value;load();};document.querySelectorAll('[data-insight-character]').forEach(b=>b.onclick=()=>{chatCharacter=b.dataset.insightCharacter;query='';page=0;view='conversations';$('pageTitle').textContent='전체 채팅';load();});
}
async function renderMatchingInsights(){
 const d=await api('/matching-insights?days='+$('days').value);
 const b=d.bandit||{total:0,popular:0,cold:0,popularRatio:70,coldRatio:30};
 const t=d.traitsAnalysis||{traits:[],ageDecades:[]};
 const candidateTable=(candidates,typeNote)=>`
  <div class="table-scroll">
   <table>
    <thead>
     <tr>
      <th>캐릭터명</th>
      <th>나이 · 성별</th>
      <th>특징 / 태그</th>
      <th>대화 턴(사용자)</th>
      <th>대화자</th>
      <th>대화방</th>
      <th></th>
     </tr>
    </thead>
    <tbody>
     ${candidates.map(c=>`
      <tr>
       <td><strong>${esc(c.name)}</strong><br><small>${esc(c.role||c.id)}</small></td>
       <td>${c.age?c.age+'세':'미상'} · ${c.gender==='male'?'남성':'여성'}</td>
       <td><small>${esc((c.tags||[]).slice(0,4).join(', ') || '-')}</small></td>
       <td>${fmt(c.userTurns||0)}회</td>
       <td>${fmt(c.users||0)}명</td>
       <td>${fmt(c.rooms||0)}개</td>
       <td><button data-insight-character="${esc(c.id)}">대화 보기</button></td>
      </tr>
     `).join('')}
    </tbody>
   </table>
  </div>
  ${candidates.length?'':`<p class="empty">${typeNote}</p>`}
 `;

 $('content').innerHTML=`
  <div class="split">
   <section class="card">
    <h2>🎯 7:3 밴딧 매칭 노출 현황</h2>
    <p class="muted">고객 반응 극대화(인기 캐릭터 70%)와 신규 반응 테스트(정보 부족 캐릭터 30%)를 Multi-Armed Bandit 방식으로 자동 조율합니다.</p>
    <div style="margin:16px 0;background:rgba(255,255,255,0.06);border-radius:12px;padding:16px;">
     <div style="display:flex;justify-content:space-between;font-size:13px;font-weight:600;margin-bottom:8px;">
      <span style="color:#ff6b8b;">🔥 인기 검증 노출 (${b.popularRatio}%)</span>
      <span style="color:#4dabf7;">🧪 반응 테스트 노출 (${b.coldRatio}%)</span>
     </div>
     <div style="display:flex;height:14px;border-radius:7px;overflow:hidden;background:#222;">
      <div style="width:${Math.max(5,Math.min(95,b.popularRatio))}%;background:linear-gradient(90deg,#ff6b8b,#f06595);transition:width 0.3s;"></div>
      <div style="width:${Math.max(5,Math.min(95,b.coldRatio))}%;background:linear-gradient(90deg,#339af0,#4dabf7);transition:width 0.3s;"></div>
     </div>
     <div style="display:flex;justify-content:space-between;font-size:11px;color:rgba(255,255,255,0.5);margin-top:6px;">
      <span>누적 ${fmt(b.popular||0)}회 (목표 70%)</span>
      <span>누적 ${fmt(b.cold||0)}회 (목표 30%)</span>
     </div>
    </div>
    <div class="grid" style="grid-template-columns:repeat(3,1fr);gap:8px;">
     <div class="card" style="padding:12px;"><div class="card-title">총 매칭 추천</div><div class="stat" style="font-size:20px;">${fmt(b.total||0)}</div><small>기간 내 추천 수</small></div>
     <div class="card" style="padding:12px;"><div class="card-title">인기 검증 풀</div><div class="stat" style="font-size:20px;color:#ff6b8b;">${fmt(d.popularTotal||0)}</div><small>3턴 이상 검증됨</small></div>
     <div class="card" style="padding:12px;"><div class="card-title">정보 부족 풀</div><div class="stat" style="font-size:20px;color:#4dabf7;">${fmt(d.coldTotal||0)}</div><small>반응 테스트 대상</small></div>
    </div>
   </section>

   <section class="card">
    <h2>인기 캐릭터 특성 군집</h2>
    <p class="muted">대화가 많이 발생하는 상위 캐릭터들의 선호 태그 및 연령대 분포입니다.</p>
    <div style="margin-bottom:12px;">
     <div class="card-title" style="margin-bottom:6px;">선호 태그 / 키워드</div>
     <div style="display:flex;flex-wrap:wrap;gap:6px;">
      ${(t.traits||[]).slice(0,10).map(x=>`<span class="pill active" style="font-size:12px;padding:3px 8px;">#${esc(x.key)} <strong>${fmt(x.count)}</strong></span>`).join('') || '<span class="muted">데이터 부족</span>'}
     </div>
    </div>
    <div>
     <div class="card-title" style="margin-bottom:6px;">선호 연령대</div>
     <div style="display:flex;flex-wrap:wrap;gap:6px;">
      ${(t.ageDecades||[]).map(x=>`<span class="pill" style="font-size:12px;padding:3px 8px;">${esc(x.key)}대 <strong>${fmt(x.count)}명</strong></span>`).join('') || '<span class="muted">데이터 부족</span>'}
     </div>
    </div>
   </section>
  </div>

  <section class="card spaced">
   <h2>🔥 인기 검증 캐릭터 풀 (Exploitation 70% 대상군)</h2>
   <p class="muted">대화 수 3턴 이상 발생하여 고객 몰입도가 입증된 캐릭터들입니다. 매칭 시 70% 가중 분배됩니다.</p>
   ${candidateTable(d.popularCandidates||[],'인기 검증 캐릭터 풀이 아직 없습니다.')}
  </section>

  <section class="card spaced">
   <h2>🧪 신규 및 정보 부족 캐릭터 풀 (Exploration 30% 대상군)</h2>
   <p class="muted">아직 고객 반응 데이터가 부족한 캐릭터들입니다. 인기 캐릭터 편중을 방지하고 새로운 반응을 수집하기 위해 30% 비율로 노출됩니다.</p>
   ${candidateTable(d.coldCandidates||[],'정보 부족 캐릭터가 없습니다. 모든 캐릭터가 검증되었습니다.')}
  </section>
 `;

 document.querySelectorAll('[data-insight-character]').forEach(b=>b.onclick=()=>{
  chatCharacter=b.dataset.insightCharacter;
  query='';
  page=0;
  view='conversations';
  $('pageTitle').textContent='전체 채팅';
  load();
 });
}
function markTester(){localStorage.setItem('azit_tester','1');document.cookie='azit_tester=1; path=/; max-age=31536000; SameSite=Lax';}
$('loginForm').onsubmit=async e=>{e.preventDefault();const b=e.submitter;b.disabled=true;try{await api('/session','POST',{password:$('password').value});markTester();$('password').value='';$('login').hidden=true;$('app').hidden=false;await load();}catch(e){$('loginError').textContent=e.message;}finally{b.disabled=false;}};
async function logout(){try{await api('/session','DELETE');}catch{}showLogin();}
$('logout').onclick=logout;$('mobileLogout').onclick=logout;$('closeDetail').onclick=()=>$('detail').close();$('refresh').onclick=load;$('days').onchange=load;document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{view=b.dataset.view;page=0;query='';engagement='all';chatCharacter='';$('pageTitle').textContent=b.textContent.slice(2).trim();document.querySelectorAll('[data-view]').forEach(x=>x.classList.toggle('active',x===b));load();});
api('/session').then(()=>{markTester();$('login').hidden=true;$('app').hidden=false;load();}).catch(()=>{});
})();
