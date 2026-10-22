(function(){
 'use strict';
 const $=id=>document.getElementById(id);
 const MIC='<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8"/></svg>';
 const SPEAKER='<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m11 4-6 5H2v6h3l6 5zM15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/></svg>';
 const STOP='<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>';
 let epoch=0,recognition=null,speakingButton=null,micConsent=false;
 let prefs={font:'normal',rate:0.9,readAloud:false};
 try{Object.assign(prefs,JSON.parse(localStorage.getItem('azit_accessibility')||'{}'));}catch{}
 if(!['normal','large','xlarge'].includes(prefs.font))prefs.font='normal';
 if(![0.8,0.9,1].includes(prefs.rate))prefs.rate=0.9;
 prefs.readAloud=prefs.readAloud===true;
 document.documentElement.dataset.wbFont=prefs.font;
 function char(){return typeof state!=='undefined'?state.currentChar:null;}
 function readLabel(button,playing){button.innerHTML=playing?STOP:SPEAKER;button.setAttribute('aria-label',playing?'읽기 중지':'소리 내어 읽기');button.title=playing?'읽기 중지':'소리 내어 읽기';button.setAttribute('aria-pressed',String(playing));}
 function micLabel(active){const b=$('wbDictate');if(!b)return;b.innerHTML=active?STOP:MIC;b.setAttribute('aria-label',active?'음성 입력 중지':'음성 입력');b.title=active?'음성 입력 중지':'음성 입력';b.setAttribute('aria-pressed',String(active));}
 function stopVoice(){const rec=recognition;recognition=null;try{rec?.stop();}catch{}window.speechSynthesis?.cancel();if(speakingButton){readLabel(speakingButton,false);speakingButton=null;}micLabel(false);if($('wbVoiceStatus'))$('wbVoiceStatus').textContent='';}
 function resetAccount(){epoch++;stopVoice();micConsent=false;$('wbDialog')?.close();}
 function speak(text,button){
  if(!prefs.readAloud)return;
  if(!('speechSynthesis'in window)){window.showToast?.('이 브라우저는 읽어주기를 지원하지 않습니다.');return;}
  if(speakingButton===button){stopVoice();return;}
  stopVoice();const u=new SpeechSynthesisUtterance(text);u.lang='ko-KR';u.rate=prefs.rate;
  const voice=speechSynthesis.getVoices().find(v=>v.lang.startsWith('ko')&&v.localService)||speechSynthesis.getVoices().find(v=>v.lang.startsWith('ko'));
  if(voice)u.voice=voice;
  speakingButton=button;readLabel(button,true);
  const finish=()=>{readLabel(button,false);if(speakingButton===button)speakingButton=null;};u.onend=finish;u.onerror=()=>{finish();window.showToast?.('음성을 재생하지 못했습니다. 다시 시도해주세요.');};
  try{speechSynthesis.speak(u);}catch{finish();window.showToast?.('읽어주기를 시작하지 못했습니다.');}
 }
 function decorateMessage(row,{sender,text,mediaType}){
  if(mediaType||!['user','ai'].includes(sender)||!text)return;
  const bubble=row.querySelector('.break-words.select-text');if(!bubble)return;bubble.textContent=text;bubble.classList.add('wb-text');
  if(sender!=='ai')return;
  const line=bubble.parentNode;line.classList.add('wb-message-line');
  const side=document.createElement('div');side.className='wb-message-side';
  const messageMeta=line.querySelector('.ai-report-actions')||line.querySelector('span');
  const button=document.createElement('button');button.type='button';button.className='wb-read';button.hidden=!prefs.readAloud;readLabel(button,false);
  button.addEventListener('click',()=>speak(text,button));side.append(button);if(messageMeta)side.append(messageMeta);line.append(side);
 }
 window.AzitWellbeing={resetAccount,decorateMessage};
 document.addEventListener('DOMContentLoaded',()=>{
  const dialog=document.createElement('dialog');dialog.id='wbDialog';dialog.setAttribute('aria-labelledby','wbTitle');
  dialog.innerHTML=`<div class="wb-head"><h2 id="wbTitle">접근성</h2><button type="button" id="wbClose" class="wb-button" aria-label="접근성 설정 닫기">닫기</button></div>
  <label>채팅 글씨 크기<select id="wbFont"><option value="normal">기본</option><option value="large">크게</option><option value="xlarge">아주 크게</option></select></label>
  <label class="wb-toggle"><input type="checkbox" id="wbReadAloud">답변 읽어주기 버튼 표시</label>
  <label id="wbRateLabel">읽어주기 속도<select id="wbRate"><option value="0.8">천천히</option><option value="0.9">조금 천천히</option><option value="1">보통</option></select></label>
  <p>켜면 상대방 말풍선 오른쪽에 듣기 버튼이 나타납니다. 자동 재생하지 않습니다. 기기·브라우저의 합성 음성이며, 캐릭터가 녹음한 목소리가 아닙니다.</p>
  <p>입력창의 마이크로 음성을 글로 입력할 수 있습니다. 음성은 브라우저·기기 제공자가 처리할 수 있으며, 아지트챗 서버에 음성 원본을 저장하지 않습니다. 읽어주기도 기기 설정에 따라 외부 음성 서비스를 사용할 수 있습니다.</p>`;
  document.body.append(dialog);
  $('wbFont').value=prefs.font;$('wbRate').value=String(prefs.rate);$('wbReadAloud').checked=prefs.readAloud;
  function sync(){document.documentElement.dataset.wbFont=prefs.font;document.querySelectorAll('.wb-read').forEach(b=>b.hidden=!prefs.readAloud);$('wbRateLabel').hidden=!prefs.readAloud;}
  function savePrefs(){stopVoice();prefs={font:$('wbFont').value,rate:Number($('wbRate').value),readAloud:$('wbReadAloud').checked};try{localStorage.setItem('azit_accessibility',JSON.stringify(prefs));}catch{}sync();}
  $('wbFont').onchange=savePrefs;$('wbRate').onchange=savePrefs;$('wbReadAloud').onchange=savePrefs;sync();
  document.querySelectorAll('.wellbeing-open').forEach(b=>b.addEventListener('click',()=>{stopVoice();dialog.showModal();}));
  $('wbClose').onclick=()=>dialog.close();
  const microphone=$('wbDictate'),Speech=window.SpeechRecognition||window.webkitSpeechRecognition;
  micLabel(false);
  if(!Speech){microphone.hidden=true;}
  else microphone.onclick=()=>{
   if(recognition){stopVoice();return;}
   const input=$('chatInput');if(input.disabled||typeof state!=='undefined'&&!state.currentChar){window.showToast?.('대화방에서 음성을 입력해주세요.');return;}
   if(!micConsent){if(!confirm('음성을 글로 바꾸기 위해 브라우저·기기 제공자가 음성을 처리할 수 있습니다. 아지트챗은 음성 원본을 저장하지 않습니다. 음성 입력을 시작할까요?'))return;micConsent=true;}
   stopVoice();const e=epoch,roomId=char()?.id,base=input.value,rec=new Speech();recognition=rec;rec.lang='ko-KR';rec.continuous=false;rec.interimResults=false;
   micLabel(true);$('wbVoiceStatus').textContent='듣고 있어요. 입력 후 직접 전송해주세요.';
   rec.onresult=event=>{if(e!==epoch||recognition!==rec||roomId!==char()?.id)return;let text='';for(let i=event.resultIndex;i<event.results.length;i++)if(event.results[i].isFinal)text+=event.results[i][0].transcript;input.value=(base+' '+text).trim();input.dispatchEvent(new Event('input',{bubbles:true}));};
   rec.onerror=event=>{if(e!==epoch||recognition!==rec)return;$('wbVoiceStatus').textContent=event.error==='not-allowed'?'마이크 권한이 필요합니다. 브라우저 설정에서 허용해주세요.':'음성을 인식하지 못했습니다. 다시 입력해주세요.';};
   rec.onend=()=>{if(recognition!==rec)return;recognition=null;micLabel(false);if(e===epoch&&$('wbVoiceStatus').textContent.startsWith('듣고'))$('wbVoiceStatus').textContent='입력된 글을 확인한 뒤 전송해주세요.';};
   try{rec.start();}catch{recognition=null;micLabel(false);$('wbVoiceStatus').textContent='마이크를 시작하지 못했습니다.';}
  };
  $('chatForm')?.addEventListener('submit',stopVoice);
  $('chatInput')?.addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey)stopVoice();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stopVoice();});
  document.addEventListener('click',event=>{if(event.target.closest('#btnSend, #btnBackToChatList, #btnHeaderNextMatch, #btnListNewMatch'))stopVoice();});
 });
})();
