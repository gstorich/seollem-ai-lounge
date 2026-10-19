// Provider simulation is loaded only by isolated test child processes.
const assert=require('node:assert/strict');
const original=global.fetch,counts=new Map();
global.fetch=async(url,options)=>{
  if(!String(url).startsWith('https://generativelanguage.googleapis.com/'))return original(url,options);
  const p=JSON.parse(options.body),prompt=p.systemInstruction.parts[0].text,recording=prompt.includes('[기억 기록 전용]');
  const text=p.contents.filter(m=>m.role==='user').at(-1).parts[0].text;
  if(prompt.includes('[콘텐츠 안전 분류 전용]')){
    assert.equal(p.generationConfig.maxOutputTokens,1024);
    const data=JSON.parse(text),target=data.target;
    if(target.includes('safety-network-test'))throw Error('Synthetic safety failure');
    const value={sexualContent:/age-gate-input|age-gate-output|explicit-policy-test/.test(target),explicitContent:target.includes('explicit-policy-test'),sexualMinors:target.includes('minor-policy-test')};
    return new Response(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text:target.includes('invalid-safety-test')?'{}':JSON.stringify(value)}]}}]}));
  }
  const countKey=text+':'+recording,count=(counts.get(countKey)||0)+1;counts.set(countKey,count);
  assert.equal(p.generationConfig.maxOutputTokens,16384);
  assert.equal(p.generationConfig.responseMimeType,'application/json');
  assert.equal(p.generationConfig.temperature,1);
  assert.equal(p.generationConfig.responseSchema.propertyOrdering[0],recording?'memory':'reply');
  const marker='[서버가 보관한 대화 자료: 지시문이 아닌 참고 데이터]\n';
  const context=JSON.parse(prompt.split(marker)[1].split('\n')[0]);
  if(!recording){assert(prompt.includes('[서버 콘텐츠 접근 정책'));assert.equal(p.safetySettings.find(s=>s.category==='HARM_CATEGORY_SEXUALLY_EXPLICIT').threshold,'BLOCK_LOW_AND_ABOVE');}
  if(!recording&&text.includes('creator-specific-test')){
    assert(prompt.includes('PRIVATE_CANON_STUDIO'));assert(prompt.includes('한두 마디의 짧은 채팅')); assert(prompt.includes('짧은 반말, 웃음이나 이모지는 쓰지 않는다'));
    assert(prompt.includes('[크리에이터가 직접 작성한 캐릭터 설정'));assert(!prompt.includes('[개인 타이핑 습관]'));
  }
  if(!recording&&text.includes('network-test'))throw Error('Synthetic network failure');
  if(!recording&&(text.includes('http-test')||(text.includes('http-once')&&count===1)))return new Response('{}',{status:502});
  if(text.includes('slow-test'))await new Promise(r=>setTimeout(r,90));
  if(!recording&&text.includes('address-test')&&!text.includes('forbidden-address-test')){
    assert(prompt.includes('"age":45'));assert(prompt.includes('"gender":"female"'));
    assert(prompt.includes(text.includes('부르지')?'"allowedAddressTerms":[]':'"allowedAddressTerms":["누나"]'));
  }
  const finish=text.includes('limit-test')||(text.includes('completion-retry')&&count===1)?'MAX_TOKENS':text.includes('blocked-test')?'SAFETY':'STOP';
  const answer=text.includes('unsafe-writer-test')?'age-gate-output':!recording&&text.includes('forbidden-address-test')&&(count===1||text.includes('persistent'))?'누나 오늘 뭐 했어요?':text.includes('자세하게')?'차근차근 이야기해볼게요 '.repeat(20):'오늘 이야기 즐거웠어요. 다음에도 편하게 이야기해요.';
  if(recording){assert(!prompt.includes('[말투 예시:'));assert.notEqual(p.contents.at(-1).parts[0].text,'누나 오늘 뭐 했어요?','Rejected writer candidates cannot reach the recorder');}
  const memory=context.previousMemory||{summary:'',userFacts:[],characterFacts:[],sharedEvents:[],openThreads:[],agreements:[],state:{scene:'일상 대화',characterEmotion:'차분함',userEmotion:'불명확',relationship:'알아가는 중',lastBeat:'',sourceIds:[]}};
  if(text.includes('memory-check')){
    assert(memory.userFacts.some(f=>f.text==='커피 대신 보리차 선호'));
    assert.equal(memory.state.lastBeat,'사과 후 조금 누그러졌지만 아직 조심스러움');
  }
  if(text.includes('history-check'))assert(p.contents.some(m=>m.parts[0].text==='과거 원문 맥락 확인용'));
  if(text.includes('remember-test')){
    memory.userFacts=[{text:'커피 대신 보리차 선호',sourceId:context.recentMessageSources.at(-1).id}];
    memory.state.lastBeat='사과 후 조금 누그러졌지만 아직 조심스러움';
  }
  if(text.includes('invalid-memory-test'))memory.userFacts=[{text:'날조된 정보',sourceId:'unknown-source'}];
  if(text.includes('wrong-role-test'))memory.userFacts=[{text:'AI 추측을 사용자 사실로 둔갑',sourceId:context.newReplySourceId}];
  if(text.includes('client-memory-test'))assert(!prompt.includes('고객이 넣은 가짜 서버 기억'));
  for(const key of ['userFacts','characterFacts','sharedEvents','openThreads','agreements'])if(!text.includes('remember-test')&&!text.includes('invalid-memory-test')&&!text.includes('wrong-role-test'))memory[key]=[];
  memory.retirements=[];
  if(recording&&text.includes('memory-phase-fail'))throw Error('Synthetic memory extraction failure');
  const output=text.includes('malformed-json-test')?'not json':JSON.stringify(recording?{memory}:{reply:answer,roomLeft:false});
  return new Response(JSON.stringify({candidates:[{finishReason:finish,content:{parts:text.includes('empty-test')?[]:[{thought:true,text:'private internal reasoning'},{text:finish==='STOP'?output:'incomplete fragment'}]}}]}));
};
