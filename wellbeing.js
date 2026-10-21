(function(){
 'use strict';
 const $=id=>document.getElementById(id);
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 let records=[],epoch=0,op=0,recognition=null,speakingButton=null,voiceBase='',voiceRoom=null;
 let prefs={font:'normal',rate:0.9};
 try{Object.assign(prefs,JSON.parse(localStorage.getItem('azit_accessibility')||'{}'));}catch{}
 if(!['normal','large','xlarge'].includes(prefs.font))prefs.font='normal';
 if(![0.8,0.9,1].includes(prefs.rate))prefs.rate=0.9;
 document.documentElement.dataset.wbFont=prefs.font;
 function char(){return typeof state!=='undefined'?state.currentChar:null;}
 function stopVoice(){try{recognition?.stop();}catch{}recognition=null;window.speechSynthesis?.cancel();if(speakingButton){speakingButton.textContent='소리 내어 읽기';speakingButton=null;}if($('wbVoiceStatus'))$('wbVoiceStatus').textContent='';}
 function resetAccount(){epoch++;op++;records=[];stopVoice();$('wbDialog')?.close();if($('wbRecords'))$('wbRecords').replaceChildren();if($('wbForm'))$('wbForm').reset();if($('wbMicConsent'))$('wbMicConsent').checked=false;}
 function speak(text,button){
  if(!('speechSynthesis'in window)){window.showToast?.('이 브라우저는 읽어주기를 지원하지 않습니다.');return;}
  if(speakingButton===button){stopVoice();return;}
  stopVoice();const u=new SpeechSynthesisUtterance(text);u.lang='ko-KR';u.rate=prefs.rate;
  const voice=speechSynthesis.getVoices().find(v=>v.lang.startsWith('ko')&&v.localService)||speechSynthesis.getVoices().find(v=>v.lang.startsWith('ko'));
  if(voice)u.voice=voice;
  speakingButton=button;button.textContent='읽기 중지';
  const finish=()=>{button.textContent='소리 내어 읽기';if(speakingButton===button)speakingButton=null;};u.onend=finish;u.onerror=()=>{finish();window.showToast?.('음성을 재생하지 못했습니다. 다시 시도해주세요.');};
  try{speechSynthesis.speak(u);}catch{finish();window.showToast?.('읽어주기를 시작하지 못했습니다.');}
 }
 function decorateMessage(row,{sender,text,mediaType}){
  if(mediaType||!['user','ai'].includes(sender)||!text)return;
  const bubble=row.querySelector('.break-words.select-text');if(!bubble)return;bubble.textContent=text;bubble.classList.add('wb-text');
  if(sender==='user'){const button=document.createElement('button');button.type='button';button.className='wb-button wb-secondary wb-read';button.textContent='안부에 기록';button.onclick=()=>window.AzitWellbeing.openRecord?.(text);bubble.append(button);}
  if(sender==='ai'){const button=document.createElement('button');button.type='button';button.className='wb-button wb-secondary wb-read';button.textContent='소리 내어 읽기';button.addEventListener('click',()=>speak(text,button));bubble.append(button);}
 }
 window.AzitWellbeing={resetAccount,decorateMessage};
 document.addEventListener('DOMContentLoaded',()=>{
  const dialog=document.createElement('dialog');dialog.id='wbDialog';dialog.setAttribute('aria-labelledby','wbTitle');
  dialog.innerHTML=`<div class="wb-head"><h2 id="wbTitle">내 안부 · 편의 설정</h2><button type="button" id="wbClose" class="wb-button" aria-label="안부 화면 닫기">닫기</button></div>
  <h3>글씨와 음성</h3><label>채팅 글씨 크기<select id="wbFont"><option value="normal">기본</option><option value="large">크게</option><option value="xlarge">아주 크게</option></select></label>
  <label>읽어주기 속도<select id="wbRate"><option value="0.8">천천히</option><option value="0.9">조금 천천히</option><option value="1">보통</option></select></label>
  <p>상대방의 글 옆 ‘소리 내어 읽기’로 들을 수 있어요. 기기·브라우저의 합성 음성이며, 캐릭터가 녹음한 목소리가 아닙니다. 주변에 들릴 수 있으니 주의해주세요.</p>
  <label><input type="checkbox" id="wbMicConsent">음성 입력 시 브라우저·기기 제공자가 음성을 처리할 수 있음을 확인했습니다.</label>
  <p>마이크는 ‘음성 입력’을 누를 때만 켜집니다. 변환된 글은 직접 확인한 뒤 전송하세요. 아지트챗 서버에 음성 원본을 저장하지 않습니다. 기기 설정에 따라 읽어주기에도 외부 음성 서비스가 사용될 수 있습니다.</p>
  <h3>내 안부 기록</h3><p>내가 남기는 일상 메모입니다. 기본적으로 본인만 볼 수 있고 자녀·보호자에게 공유되지 않습니다. 건강정보 등 민감한 내용은 입력하지 마세요. 의료·응급 모니터링 기능은 아닙니다.</p>
  <form id="wbForm"><input type="hidden" id="wbId"><label>날짜<input id="wbDate" type="date" required></label><label>오늘의 기분<select id="wbMood"><option value="">선택 안 함</option><option>좋아요</option><option>보통이에요</option><option>쉬고 싶어요</option></select></label>
  <label>일상 메모<textarea id="wbNote" maxlength="1000" required placeholder="예: 내일은 친구와 공원에 가기로 했어요"></textarea></label>
  <label>이 기록을 참고할 상대<select id="wbCharacter"><option value="">나만 보기</option></select></label>
  <label><input type="checkbox" id="wbContextConsent">선택한 AI 상대가 이 기록을 대화 생성에 참고하도록 허용합니다.</label>
  <p>허용한 기록만 해당 상대와의 AI 대화 생성에 전달됩니다. 선택을 ‘나만 보기’로 바꾸면 이후 참고가 중단됩니다. 기록 삭제는 이미 나눈 대화를 지우지는 않습니다. 게스트 기록을 계속 보관하려면 휴대폰 번호를 연결해주세요.</p>
  <div class="wb-actions"><button id="wbSave" class="wb-button" type="submit">기록 저장</button><button id="wbNew" class="wb-button wb-secondary" type="button">새 기록</button></div></form>
  <div id="wbStatus" role="status" aria-live="polite"></div><div id="wbRecords"></div>`;
  document.body.append(dialog);
  $('wbFont').value=prefs.font;$('wbRate').value=String(prefs.rate);
  function savePrefs(){prefs={font:$('wbFont').value,rate:Number($('wbRate').value)};document.documentElement.dataset.wbFont=prefs.font;try{localStorage.setItem('azit_accessibility',JSON.stringify(prefs));}catch{}}
  $('wbFont').onchange=savePrefs;$('wbRate').onchange=savePrefs;
  const status=message=>$('wbStatus').textContent=message;
  function clearForm(){ $('wbForm').reset();$('wbId').value='';$('wbDate').value=today();$('wbSave').textContent='기록 저장'; }
  function choices(){const current=char();const rooms=typeof state!=='undefined'?state.savedRooms||{}:{};const chars=typeof CHARACTERS!=='undefined'?CHARACTERS:[];
   const ids=new Set([...Object.keys(rooms),...records.map(r=>r.characterId).filter(Boolean),...(current?[current.id]:[])]);
   $('wbCharacter').innerHTML='<option value="">나만 보기</option>'+[...ids].map(id=>`<option value="${esc(id)}">${esc(chars.find(c=>c.id===id)?.name||id)}</option>`).join('');
  }
  function render(){choices();$('wbRecords').innerHTML=records.length?records.map(r=>`<article><strong>${esc(r.date)} ${esc(r.mood)}</strong><p>${esc(r.note)}</p><p>${r.characterId?'선택한 상대만 참고 허용':'나만 보기'} · 가족 공유 안 함</p><div class="wb-actions"><button class="wb-button" type="button" data-edit="${esc(r.id)}">수정</button><button class="wb-button wb-secondary" type="button" data-delete="${esc(r.id)}">삭제</button></div></article>`).join(''):'<p>아직 남긴 안부 기록이 없습니다.</p>';}
  async function load(){const e=epoch,operation=++op;status('기록을 불러오는 중입니다…');try{const data=await ApiClient.request('/wellbeing');if(e!==epoch||operation!==op)return;records=data.records;render();status('');}catch(error){if(e===epoch&&operation===op)status(error.message||'기록을 불러오지 못했습니다.');}}
  async function open(){stopVoice();clearForm();dialog.showModal();await load();}
  window.AzitWellbeing.openRecord=async text=>{const e=epoch;await open();if(e!==epoch)return;$('wbNote').value=String(text).slice(0,1000);$('wbNote').focus();};
  document.querySelectorAll('.wellbeing-open').forEach(b=>b.addEventListener('click',open));
  $('wbClose').onclick=()=>dialog.close();dialog.addEventListener('close',()=>{if(recognition)stopVoice();});$('wbNew').onclick=()=>{clearForm();status('');};
  $('wbForm').onsubmit=async event=>{event.preventDefault();const id=$('wbId').value,old=records.find(r=>r.id===id),characterId=$('wbCharacter').value||null;
   if(characterId&&!$('wbContextConsent').checked){status('선택한 상대가 기록을 참고하도록 허용하거나 나만 보기를 선택해주세요.');return;}
   const e=epoch;const body={date:$('wbDate').value,mood:$('wbMood').value,note:$('wbNote').value,characterId,contextConsent:$('wbContextConsent').checked,version:old?.updatedAt};
   $('wbSave').disabled=true;try{await ApiClient.request('/wellbeing'+(id?'/'+encodeURIComponent(id):''),id?'PUT':'POST',body);if(e!==epoch)return;clearForm();await load();status('저장했습니다.');}catch(error){if(e===epoch)status(error.message);}finally{$('wbSave').disabled=false;}
  };
  $('wbRecords').onclick=async event=>{const button=event.target.closest('button');if(!button)return;const id=button.dataset.edit||button.dataset.delete,r=records.find(x=>x.id===id);if(!r)return;
   if(button.dataset.edit){$('wbId').value=id;$('wbDate').value=r.date;$('wbMood').value=r.mood;$('wbNote').value=r.note;$('wbCharacter').value=r.characterId||'';$('wbContextConsent').checked=r.contextConsent;$('wbSave').textContent='수정 저장';$('wbNote').focus();return;}
   if(!confirm('이 안부 기록을 삭제할까요? 이미 나눈 대화는 유지됩니다.'))return;const e=epoch;button.disabled=true;try{await ApiClient.request('/wellbeing/'+encodeURIComponent(id),'DELETE');if(e!==epoch)return;clearForm();await load();status('삭제했습니다.');}catch(error){if(e===epoch)status(error.message);}finally{button.disabled=false;}
  };
  const microphone=$('wbDictate'),Speech=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!Speech){microphone.disabled=true;microphone.textContent='음성 입력 미지원';microphone.title='휴대폰 키보드의 마이크로 입력할 수 있습니다.';}
  else microphone.onclick=async()=>{
   if(recognition){recognition.stop();return;}
   if(!$('wbMicConsent').checked){await open();status('위 음성 처리 안내를 확인한 뒤 체크해주세요.');$('wbMicConsent').focus();return;}
   const input=$('chatInput');if(input.disabled||typeof state!=='undefined'&&!state.currentChar){window.showToast?.('대화방에서 음성을 입력해주세요.');return;}
   stopVoice();const e=epoch;const rec=new Speech();recognition=rec;rec.lang='ko-KR';rec.continuous=false;rec.interimResults=false;voiceBase=input.value;voiceRoom=char()?.id;
   microphone.textContent='음성 입력 중지';$('wbVoiceStatus').textContent='듣고 있어요. 입력 후 직접 전송해주세요.';
   rec.onresult=event=>{if(e!==epoch||recognition!==rec||voiceRoom!==char()?.id)return;let text='';for(let i=event.resultIndex;i<event.results.length;i++)if(event.results[i].isFinal)text+=event.results[i][0].transcript;input.value=(voiceBase+' '+text).trim();input.dispatchEvent(new Event('input',{bubbles:true}));};
   rec.onerror=event=>{if(e===epoch)$('wbVoiceStatus').textContent=event.error==='not-allowed'?'마이크 권한이 필요합니다. 브라우저 설정에서 허용해주세요.':'음성을 인식하지 못했습니다. 다시 입력해주세요.';};
   rec.onend=()=>{if(recognition===rec)recognition=null;microphone.textContent='음성 입력';if(e===epoch&&$('wbVoiceStatus').textContent.startsWith('듣고'))$('wbVoiceStatus').textContent='입력된 글을 확인한 뒤 전송해주세요.';};
   try{rec.start();}catch{recognition=null;microphone.textContent='음성 입력';$('wbVoiceStatus').textContent='마이크를 시작하지 못했습니다.';}
  };
  $('chatForm')?.addEventListener('submit',stopVoice);
  $('chatInput')?.addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey)stopVoice();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stopVoice();});
  document.addEventListener('click',event=>{if(event.target.closest('#btnSend, #btnBackToList, #btnRematch, #btnCloseChat, #btnBackToContacts, #btnOtherPerson, #btnBackToChatList, #btnHeaderNextMatch, #btnListNewMatch'))stopVoice();});
 });
})();
