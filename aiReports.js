(()=>{'use strict';
const categories={sexual_minors:'미성년자 관련 성적 내용',non_consensual:'비동의·강압적 내용',sexual:'원치 않는 성적 내용',harm:'위험·범죄·혐오 내용',privacy:'개인정보·실존 인물 침해',quality:'반복·맥락 오류·부적절한 말투',other:'기타'};
let dialog,busy=false,historyPage=0,menu,menuTrigger;
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date=x=>new Date(x).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'});
const flagSvg='<svg class="ai-report-flag-icon" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>';
function closeMenu(restoreFocus=false){
 if(!menu)return;
 menu.remove();menu=null;
 const trigger=menuTrigger;menuTrigger=null;
 trigger?.setAttribute('aria-expanded','false');
 if(restoreFocus&&trigger?.isConnected)trigger.focus();
}
function showMenu(trigger,item){
 if(menuTrigger===trigger){closeMenu();return;}
 closeMenu();menuTrigger=trigger;trigger.setAttribute('aria-expanded','true');
 menu=document.createElement('div');menu.id='aiAnswerMenu';menu.className='ai-answer-menu';menu.setAttribute('role','menu');menu.setAttribute('aria-label','AI 답변 메뉴');
 const report=document.createElement('button');report.type='button';report.setAttribute('role','menuitem');report.tabIndex=-1;report.textContent='⚑ 신고하기';
 report.onclick=()=>{closeMenu();open(item);};menu.append(report);document.body.append(menu);
 const bounds=trigger.getBoundingClientRect(),height=menu.offsetHeight;
 menu.style.left=Math.max(8,Math.min(bounds.left,window.innerWidth-menu.offsetWidth-8))+'px';
 menu.style.top=Math.max(8,bounds.bottom+height+8>window.innerHeight?bounds.top-height-4:bounds.bottom+4)+'px';report.focus();
}
document.addEventListener('pointerdown',e=>{if(menu&&!menu.contains(e.target)&&!menuTrigger?.contains(e.target))closeMenu();});
document.addEventListener('keydown',e=>{if(menu&&['Escape','Tab'].includes(e.key)){closeMenu(e.key==='Escape');if(e.key==='Escape'){e.preventDefault();e.stopPropagation();}}});
document.addEventListener('scroll',()=>closeMenu(),true);
window.addEventListener('resize',()=>closeMenu());
function shell(title){
 closeMenu();
 if(!dialog){dialog=document.createElement('dialog');dialog.className='ai-report-dialog';dialog.innerHTML='<div class="ai-report-top"><h2 id="aiReportTitle"></h2><button type="button" aria-label="신고 창 닫기">✕</button></div><div class="ai-report-body"></div>';dialog.setAttribute('aria-labelledby','aiReportTitle');document.body.append(dialog);dialog.querySelector('button').onclick=()=>dialog.close();dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();});}
 dialog.querySelector('h2').textContent=title;const body=dialog.querySelector('.ai-report-body');body.replaceChildren();if(!dialog.open)dialog.showModal();return body;
}
async function history(){
 const body=shell('내 AI 답변 신고');body.textContent='불러오는 중…';
 try{const d=await window.ApiClient.request('/ai-reports?page='+historyPage);body.innerHTML='<p class="ai-report-muted">신고는 운영자가 검토합니다. 처리 결과는 이곳에서 확인할 수 있습니다. 게스트는 같은 브라우저에서 확인해주세요.</p>'+(d.items.map(r=>`<article class="ai-report-history"><strong>${esc(r.characterName)} · ${esc(d.categories[r.category]||r.category)} · ${esc(d.states[r.status]||r.status)}</strong><small>${date(r.createdAt)}</small><p>${esc(r.publicReply||'접수되었습니다. 검토 후 결과를 안내합니다.')}</p><button type="button" data-report-id="${esc(r.id)}">접수 내용 보기</button></article>`).join('')||'<p>접수한 신고가 없습니다.</p>')+`<div class="ai-report-top"><button id="aiReportPrev" ${historyPage===0?'disabled':''}>이전</button><span>${historyPage+1} 페이지</span><button id="aiReportNext" ${(historyPage+1)*20>=d.total?'disabled':''}>다음</button></div>`;
 body.querySelector('#aiReportPrev').onclick=()=>{historyPage--;history();};body.querySelector('#aiReportNext').onclick=()=>{historyPage++;history();};
 body.querySelectorAll('[data-report-id]').forEach(b=>b.onclick=async()=>{b.disabled=true;try{const {report:r}=await window.ApiClient.request('/ai-reports/'+encodeURIComponent(b.dataset.reportId));const detail=shell('신고 접수 내용');detail.innerHTML=`<p>${esc(d.categories[r.category])} · ${esc(d.states[r.status])}</p><blockquote>${esc(r.messages.find(m=>m.target)?.text||'')}</blockquote><p>${esc(r.detail||'추가 설명 없음')}</p><h3>검토 결과</h3><p>${esc(r.publicReply||'검토 대기 중입니다.')}</p><button id="aiReportBack">내 신고 목록</button>`;detail.querySelector('button').onclick=history;}catch(e){b.disabled=false;body.append(Object.assign(document.createElement('p'),{textContent:e.message}));}});
 }catch(e){body.textContent=e.message||'내역을 불러오지 못했습니다.';}
}
function open(item){
 const body=shell('AI 답변 신고');
 body.innerHTML=`<p class="ai-report-muted">AI가 생성한 답변의 문제를 알려주세요. 신고한 답변과 앞선 최대 4개·뒤의 최대 2개 메시지를 운영자가 함께 확인합니다. 신고는 자동 제재나 환불을 의미하지 않습니다.</p><blockquote>${esc(item.text).slice(0,1500)}</blockquote><form id="aiReportForm"><label for="aiReportReason">신고 사유</label><select id="aiReportReason" required><option value="">사유를 선택해주세요</option>${Object.entries(categories).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select><label for="aiReportDetail">추가 설명 (선택)</label><textarea id="aiReportDetail" maxlength="1500" rows="3" placeholder="문제가 된 부분을 알려주세요. 연락처·인증번호 등 민감정보는 쓰지 마세요."></textarea><p class="ai-report-muted">신고 내용과 관련 맥락은 처리·이의 대응을 위해 접수일부터 최대 1년 보관합니다. <a href="/privacy" target="_blank" rel="noopener">개인정보 안내</a></p><p id="aiReportError" role="alert"></p><button type="submit" class="ai-report-primary">신고 접수</button></form><button id="aiReportHistory" type="button" class="ai-report-link">내 신고·처리 결과 보기</button>`;
 body.querySelector('#aiReportHistory').onclick=history;
 body.querySelector('form').onsubmit=async e=>{e.preventDefault();if(busy)return;const button=e.submitter;button.disabled=true;busy=true;try{
  await window.ApiClient.request('/ai-reports','POST',{characterId:item.characterId,messageId:item.messageId,category:body.querySelector('select').value,detail:body.querySelector('textarea').value});
  body.innerHTML='<p role="status">신고가 접수되었습니다. 운영자가 내용을 검토한 뒤 결과를 안내합니다.</p><button id="aiReportDone">처리 현황 보기</button>';body.querySelector('button').onclick=()=>{historyPage=0;history();};
 }catch(e){body.querySelector('#aiReportError').textContent=e.message||'접수하지 못했습니다. 잠시 후 다시 시도해주세요.';button.disabled=false;}finally{busy=false;}};
}
window.AzitAiReports={configure(){document.querySelectorAll('[data-ai-report-history]').forEach(b=>b.onclick=()=>{historyPage=0;history();});},decorate(row,{sender,text,messageId,characterId}){
 if(sender!=='ai'||!messageId||!characterId)return;
 const content=row.children[1],line=content?.children[1],time=line?.lastElementChild;if(!line||!time)return;
 const actions=document.createElement('div');actions.className='ai-report-actions';line.replaceChild(actions,time);
 const b=document.createElement('button');b.type='button';b.className='ai-report-trigger';b.innerHTML=flagSvg;b.setAttribute('aria-label','AI 답변 신고');b.setAttribute('title','AI 답변 신고');
 const item={messageId,characterId,text};b.onclick=()=>open(item);actions.append(b,time);
},history};
})();
