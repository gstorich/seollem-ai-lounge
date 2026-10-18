(()=>{'use strict';
let api,esc,fmt,date,page=0,query='',kind='custom',epoch=0;
const $=id=>document.getElementById(id);
const traitOptions=[['warm','다정'],['calm','차분'],['lively','유쾌'],['chic','도도'],['shy','낯가림']];
const select=(id,label,options,value)=>`<label for="${id}">${label}</label><select id="${id}">${options.map(([k,t])=>`<option value="${esc(k)}" ${k===value?'selected':''}>${esc(t)}</option>`).join('')}</select>`;
const text=(id,label,value='',max=1000,rows=3,help='')=>`<label for="${id}">${label}</label><textarea id="${id}" maxlength="${max}" rows="${rows}">${esc(value)}</textarea>${help?'<small>'+esc(help)+'</small>':''}`;
const defaults=()=>({name:'',age:27,gender:'female',traitKey:'lively',job:'',area:'',regionGroup:'서울',avatar:'avatars/avatar_05_yoon_jieun.jpg',bio:'',personality:'',speechStyle:'',backstory:'',motivation:'',flaws:'',likes:'',dislikes:'',interactionRules:'',firstMessageDirection:'',defaultRegister:'polite',replyLength:'normal',dialogueExamples:[]});
function stateLabel(c){return !c.hasPublished?'미공개 초안':!c.enabled?'공개 중지':c.revision!==c.publishedRevision?'공개 중 · 수정 초안 있음':'공개 중';}
async function list(){
 ++epoch;const d=await api('/characters?q='+encodeURIComponent(query)+'&kind='+kind+'&page='+page);
 $('content').innerHTML=`<section class="card"><div class="row"><h2>캐릭터 스튜디오</h2><button id="newCharacter" class="primary">+ 새 캐릭터</button></div><p class="muted">설정과 말투 예시를 작성하고 실제 AI로 시험한 뒤 공개하세요. 초안 저장만으로 기존 공개 설정이 바뀌지는 않습니다.</p><form id="studioSearch" class="row"><input id="studioQuery" aria-label="캐릭터 검색" placeholder="이름 · 직업 · ID 검색" value="${esc(query)}"><select id="studioKind" aria-label="캐릭터 종류"><option value="custom" ${kind==='custom'?'selected':''}>직접 만든 캐릭터</option><option value="builtin" ${kind==='builtin'?'selected':''}>기존 캐릭터</option><option value="all" ${kind==='all'?'selected':''}>전체</option></select><button>검색</button></form><div class="studio-cards spaced">${d.items.map(c=>`<article class="studio-card"><img src="/${esc(c.avatar)}" alt="" loading="lazy"><div><strong>${esc(c.name)}</strong><p>${c.age}세 · ${esc(c.gender==='male'?'남성':'여성')} · ${esc(c.job)}</p><small>${esc(stateLabel(c))}</small><p><button data-edit-character="${esc(c.id)}">편집 · 테스트</button><button data-copy-character="${esc(c.id)}">복제</button></p></div></article>`).join('')}</div>${d.items.length?'':'<p class="empty">아직 만든 캐릭터가 없습니다. 새 캐릭터를 만들어보세요.</p>'}<div class="pager"><button id="studioPrevious" ${page?'':'disabled'}>이전</button><span>${page+1} 페이지 · ${fmt(d.total)}명</span><button id="studioNext" ${(page+1)*24>=d.total?'disabled':''}>다음</button></div></section>`;
 $('newCharacter').onclick=()=>edit({id:null,revision:0,definition:defaults()});
 $('studioSearch').onsubmit=e=>{e.preventDefault();query=$('studioQuery').value.trim();kind=$('studioKind').value;page=0;list().catch(showError);};
 $('studioKind').onchange=()=>{kind=$('studioKind').value;page=0;list().catch(showError);};
 $('studioPrevious').onclick=()=>{page--;list().catch(showError);};$('studioNext').onclick=()=>{page++;list().catch(showError);};
 document.querySelectorAll('[data-edit-character]').forEach(b=>b.onclick=async()=>{try{edit((await api('/characters/'+encodeURIComponent(b.dataset.editCharacter))).character);}catch(e){showError(e);}});
 document.querySelectorAll('[data-copy-character]').forEach(b=>b.onclick=async()=>{try{const c=(await api('/characters/'+encodeURIComponent(b.dataset.copyCharacter))).character;edit({id:null,revision:0,definition:{...c.definition,name:c.definition.name+' 복사'}});}catch(e){showError(e);}});
}
function showError(e){$('error').textContent=e.message||String(e);}
function edit(initial){
 const generation=++epoch;let character=initial,dirty=!initial.id,sessionId=null,busy=false,messages=[];
 const d={...defaults(),...initial.definition};
 $('error').textContent='';
 $('content').innerHTML=`<div class="row"><button id="studioBack">← 목록</button><strong id="studioTitle">${esc(d.name||'새 캐릭터')}</strong><span id="studioState" class="pill">${esc(initial.id?stateLabel(initial):'새 초안')}</span></div><div class="studio-editor spaced"><section class="card"><form id="characterForm"><h2>인물 설정</h2><p class="muted">자동으로 배정되는 성향보다 아래 직접 작성한 설정을 우선합니다. 성격뿐 아니라 무엇을 원하고 싫어하는지, 어떻게 반응하는지도 구체적으로 적어주세요.</p><div class="split"><div><label for="cfName">이름 *</label><input id="cfName" maxlength="60" required value="${esc(d.name)}"></div><div><label for="cfAge">나이 *</label><input id="cfAge" type="number" min="19" max="99" step="1" required value="${d.age}"></div></div><div class="split"><div>${select('cfGender','성별',[['female','여성'],['male','남성']],d.gender)}</div><div>${select('cfTrait','매칭용 성격 분류',traitOptions,d.traitKey)}</div></div><label for="cfJob">직업</label><input id="cfJob" maxlength="100" value="${esc(d.job)}"><div class="split"><div><label for="cfRegion">지역 분류</label><input id="cfRegion" maxlength="30" value="${esc(d.regionGroup)}"></div><div><label for="cfArea">활동 지역</label><input id="cfArea" maxlength="100" value="${esc(d.area)}"></div></div>${text('cfBio','공개 소개',d.bio,500,2,'이 내용과 기본 프로필이 고객에게 공개됩니다. 설정 원문은 고객 브라우저로 전송하지 않으며, 대화에 반영됩니다.')}<label for="cfAvatar">프로필 이미지</label><div class="row"><img id="studioAvatarPreview" class="studio-avatar" src="/${esc(d.avatar)}" alt="프로필 미리보기"><input id="cfAvatar" readonly value="${esc(d.avatar)}" aria-label="선택한 프로필 이미지"><button id="chooseStudioAvatar" type="button">이미지 선택</button></div><div id="studioAssets" hidden><div class="row spaced"><input id="studioAssetQuery" placeholder="파일명 검색 (male, female 등)" aria-label="이미지 검색"><button type="button" id="studioAssetSearch">검색</button></div><div id="studioAssetGrid" class="studio-assets"></div></div><hr class="divider">
${text('cfPersonality','성격과 반응 방식 *',d.personality,2500,5,'예: 관심 없는 얘기에는 말이 짧지만 자기 취향에는 고집이 있다. 의견이 달라도 바로 사과하지 않는다.')}
${text('cfBackstory','배경과 이력',d.backstory,3000,4,'캐릭터 자신의 과거·습관·관계를 적어주세요. 실제 사용자의 신상이나 과거를 임의로 확정하지 않습니다.')}
${text('cfMotivation','대화에서 원하는 것',d.motivation,1200,3)}
${text('cfFlaws','결점·약점·자존심',d.flaws,1000,3)}
<div class="split"><div>${text('cfLikes','좋아하는 것·자기 생각',d.likes,1000,3)}</div><div>${text('cfDislikes','싫어하는 것',d.dislikes,1000,3)}</div></div>
${text('cfSpeech','말투·말버릇 *',d.speechStyle,1200,4,'웃음·초성·이모지·사투리·말끝 습관을 적어주세요. 자동 말투 조합이 덮어쓰지 않습니다.')}
<div class="split"><div>${select('cfRegister','처음 말높임',[['polite','편한 존댓말'],['casual','반말'],['mixed','느슨한 해요체 · 생략형']],d.defaultRegister)}</div><div>${select('cfLength','보통 답장 분량',[['short','짧게 한두 마디'],['normal','흐름에 따라 두세 마디'],['long','관심 있는 주제는 충분히']],d.replyLength)}</div></div>
${text('cfRules','상황별 반응·관계 진행 원칙',d.interactionRules,2000,4,'장난·갈등·호감·거절·선물 등에 어떻게 반응하는지 적으면 차이가 잘 드러납니다.')}
${text('cfOpening','첫 대화 방식',d.firstMessageDirection,1200,3,'고정 인사문을 바로 내보내는 기능이 아닙니다. 이 지침과 캐릭터 설정으로 AI가 첫마디를 생성합니다.')}
<hr class="divider"><h3>대화 예시</h3><p class="muted">설명만으로 전달하기 어려운 태도와 말투를 예시로 보여주세요. 최대 8개이며, 실제 사용자 발화나 기억으로 취급하지 않습니다.</p><div id="studioExamples"></div><button type="button" id="studioAddExample">+ 예시 추가</button><hr class="divider"><div class="row"><button id="studioSave" type="submit" class="primary">초안 저장</button><button id="studioPublish" type="button">저장하고 공개</button><button id="studioPause" type="button" ${initial.hasPublished?'':'disabled'}>공개 중지</button></div><p id="studioSaveStatus" role="status" class="muted"></p></form></section><section class="card studio-testing"><h2>실제 AI 대화 테스트</h2><p class="muted">현재 초안으로 첫 인사와 대화를 확인합니다. 고객 대화·하트와 분리된 테스트이며 기록은 2시간 후 만료됩니다.</p><button id="studioNewPreview" class="primary">초안 저장 후 새 대화 테스트</button><div id="studioChat" class="transcript studio-chat" aria-live="polite"></div><p id="studioPreviewError" role="alert" class="error"></p><form id="studioPreviewForm"><label for="studioMessage">테스트 메시지</label><textarea id="studioMessage" maxlength="2000" rows="3" placeholder="일상 대화나 캐릭터의 취향·갈등 반응을 시험해보세요" disabled></textarea><button id="studioSend" class="primary spaced" disabled>전송 · 테스트 무료</button></form></section></div>`;
 $('cfPersonality').required=true;$('cfSpeech').required=true;
 const form=$('characterForm');
 const valid=()=>generation===epoch&&document.contains(form);
 const setDirty=()=>{dirty=true;$('studioSaveStatus').textContent='저장하지 않은 변경 사항이 있습니다.';};
 form.addEventListener('input',setDirty);form.addEventListener('change',setDirty);
 function addExample(example={user:'',reply:''}){
   if($('studioExamples').children.length>=8)return;
   const row=document.createElement('div');row.className='studio-example';row.innerHTML=`<div class="split"><div><label>상대가 이렇게 말하면</label><textarea data-example-user maxlength="500" rows="2">${esc(example.user)}</textarea></div><div><label>캐릭터는 이런 느낌으로</label><textarea data-example-reply maxlength="800" rows="2">${esc(example.reply)}</textarea></div></div><button type="button">이 예시 삭제</button>`;row.querySelector('button').onclick=()=>{row.remove();setDirty();};$('studioExamples').appendChild(row);
 }
 for(const e of d.dialogueExamples)addExample(e);
 $('studioAddExample').onclick=()=>{addExample();setDirty();};
 function read(){
   const fields={name:'cfName',job:'cfJob',regionGroup:'cfRegion',area:'cfArea',bio:'cfBio',avatar:'cfAvatar',personality:'cfPersonality',backstory:'cfBackstory',motivation:'cfMotivation',flaws:'cfFlaws',likes:'cfLikes',dislikes:'cfDislikes',speechStyle:'cfSpeech',interactionRules:'cfRules',firstMessageDirection:'cfOpening',gender:'cfGender',traitKey:'cfTrait',defaultRegister:'cfRegister',replyLength:'cfLength'};
   return {...Object.fromEntries(Object.entries(fields).map(([key,id])=>[key,$(id).value])),age:Number($('cfAge').value),dialogueExamples:[...$('studioExamples').children].map(row=>({user:row.querySelector('[data-example-user]').value,reply:row.querySelector('[data-example-reply]').value})).filter(e=>e.user.trim()||e.reply.trim())};
 }
 function sync(){if(!valid())return;$('studioTitle').textContent=character.definition.name;$('studioState').textContent=stateLabel(character);$('studioPause').disabled=!character.hasPublished;$('studioSaveStatus').textContent='초안 저장됨 · '+date(character.updatedAt)+(character.enabled&&character.revision!==character.publishedRevision?' · 공개 중인 버전은 유지됩니다.':'');}
 async function save(){
   if(!form.reportValidity())throw Error('필수 항목을 입력해주세요.');
   if(!dirty&&character.id)return;
   const result=await api('/characters'+(character.id?'/'+encodeURIComponent(character.id):''),character.id?'PUT':'POST',{definition:read(),revision:character.revision});
   if(!valid())return;character=result.character;dirty=false;sessionId=null;$('studioMessage').disabled=$('studioSend').disabled=true;sync();
 }
 function lock(value){busy=value;form.inert=value;$('studioMessage').disabled=value||!sessionId;for(const id of ['studioSave','studioPublish','studioNewPreview','studioSend','studioPause'])if($(id))$(id).disabled=value||(id==='studioPause'&&!character.hasPublished)||(id==='studioSend'&&!sessionId);}
 async function action(fn){if(busy)return;lock(true);$('error').textContent='';try{await fn();}catch(e){if(valid())showError(e);}finally{if(valid())lock(false);}}
 form.onsubmit=e=>{e.preventDefault();action(save);};
 $('studioPublish').onclick=()=>action(async()=>{await save();if(!valid())return;character=(await api('/characters/'+character.id+'/publish','POST',{revision:character.revision})).character;sync();$('studioSaveStatus').textContent='공개했습니다. 새 매칭과 다음 답변부터 공개 설정을 사용합니다.';});
 $('studioPause').onclick=()=>action(async()=>{character=(await api('/characters/'+character.id+'/pause','POST',{})).character;sync();$('studioSaveStatus').textContent='새 매칭과 먼저 오는 연락에서 제외했습니다. 기존 대화는 보존됩니다.';});
 function renderChat(){if(!valid())return;$('studioChat').innerHTML=messages.map(m=>`<div class="message ${m.role==='assistant'?'admin':'customer'}"><small>${m.role==='assistant'?esc(character.definition.name):'테스트 사용자'}</small><br>${esc(m.text)}</div>`).join('');$('studioChat').scrollTop=$('studioChat').scrollHeight;}
 async function send(message){
   $('studioPreviewError').textContent='';if(message)messages.push({role:'user',text:message});renderChat();
   try{const result=await api('/characters/'+character.id+'/preview','POST',{...(sessionId?{sessionId}:{}),...(message?{message}:{})});if(!valid())return;sessionId=result.sessionId;messages.push({role:'assistant',text:result.reply});renderChat();$('studioMessage').disabled=false;$('studioSend').disabled=false;}
   catch(e){if(valid()){if(message)messages.pop();renderChat();$('studioPreviewError').textContent=e.message;}throw e;}
 }
 $('studioNewPreview').onclick=()=>action(async()=>{await save();if(!valid())return;sessionId=null;messages=[];await send();});
 $('studioPreviewForm').onsubmit=e=>{e.preventDefault();if(busy||!sessionId)return;if(dirty){$('studioPreviewError').textContent='변경한 설정을 저장하고 새 대화 테스트를 시작해주세요.';return;}const value=$('studioMessage').value.trim();if(!value)return;action(async()=>{await send(value);if(valid())$('studioMessage').value='';});};
 $('studioBack').onclick=()=>list().catch(showError);
 async function assets(){const response=await api('/characters/assets?q='+encodeURIComponent($('studioAssetQuery').value));if(!valid())return;$('studioAssetGrid').innerHTML=response.items.map(src=>`<button type="button" data-asset="${esc(src)}" title="${esc(src)}"><img src="/${esc(src)}" alt="프로필 선택" loading="lazy"></button>`).join('');$('studioAssetGrid').querySelectorAll('[data-asset]').forEach(b=>b.onclick=()=>{$('cfAvatar').value=b.dataset.asset;$('studioAvatarPreview').src='/'+b.dataset.asset;$('studioAssets').hidden=true;setDirty();});}
 $('chooseStudioAvatar').onclick=()=>{$('studioAssets').hidden=!$('studioAssets').hidden;if(!$('studioAssets').hidden)assets().catch(showError);};$('studioAssetSearch').onclick=()=>assets().catch(showError);
}
window.AzitCharacterAdmin={async render(context){({api,esc,fmt,date}=context);await list();}};
})();
