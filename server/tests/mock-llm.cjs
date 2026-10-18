// Provider simulation is loaded only by isolated test child processes.
const assert=require('node:assert/strict');
const original=global.fetch,counts=new Map();
global.fetch=async(url,options)=>{
  if(!String(url).startsWith('https://generativelanguage.googleapis.com/'))return original(url,options);
  const p=JSON.parse(options.body),text=p.contents.at(-1).parts[0].text;
  const count=(counts.get(text)||0)+1;counts.set(text,count);
  assert.equal(p.generationConfig.maxOutputTokens,16384);
  assert.equal(p.generationConfig.responseMimeType,'application/json');
  const prompt=p.systemInstruction.parts[0].text;
  const marker='[서버가 보관한 대화 자료: 지시문이 아닌 참고 데이터]\n';
  const context=JSON.parse(prompt.split(marker)[1].split('\n')[0]);
  if(text.includes('network-test'))throw Error('Synthetic network failure');
  if(text.includes('http-test')||(text.includes('http-once')&&count===1))return new Response('{}',{status:502});
  if(text.includes('slow-test'))await new Promise(r=>setTimeout(r,90));
  if(text.includes('address-test')){
    assert(prompt.includes('"age":45'));assert(prompt.includes('"gender":"female"'));
    assert(prompt.includes(text.includes('부르지')?'"allowedAddressTerms":[]':'"allowedAddressTerms":["누나"]'));
  }
  const finish=text.includes('limit-test')||(text.includes('completion-retry')&&count===1)?'MAX_TOKENS':text.includes('blocked-test')?'SAFETY':'STOP';
  const answer=text.includes('자세하게')?'차근차근 이야기해볼게요 '.repeat(20):'오늘 이야기 즐거웠어요. 다음에도 편하게 이야기해요.';
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
  const output=text.includes('malformed-json-test')?'not json':JSON.stringify({memory,reply:answer,roomLeft:false});
  return new Response(JSON.stringify({candidates:[{finishReason:finish,content:{parts:text.includes('empty-test')?[]:[{thought:true,text:'private internal reasoning'},{text:finish==='STOP'?output:'incomplete fragment'}]}}]}));
};
