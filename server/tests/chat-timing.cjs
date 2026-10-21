const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const timing=require('../../chatTiming');
const short='이제 퇴근했어요?',long='긴 답변도 충분한 입력 시간을 가져야 합니다. '.repeat(8);
assert(timing.typingDuration(short,()=>0)>=600&&timing.typingDuration(short,()=>0)<=1200,'Short replies must type quickly without artificial floor');
assert(timing.typingDuration(long,()=>0)>=6000&&timing.typingDuration(long,()=>0)<=10000,'Long replies must finish within realistic bounds');
assert(timing.typingDuration('가'.repeat(10000),()=>1)<=10000,'Capped typing time must not exceed 10s');
assert(timing.remainingDelay(long,60000,()=>0)>=1000&&timing.remainingDelay(long,60000,()=>0)<=2000,'Slow model response must finish with a natural short beat');
assert.equal(timing.greetingRemainingDelay(5000),0,'Provider latency must not be followed by artificial greeting typing');
assert.equal(timing.greetingRemainingDelay(100),0,'Greeting displays immediately once generated');
assert(timing.subsequentBubbleDelay('짧은 답변',()=>0)>=350&&timing.subsequentBubbleDelay('짧은 답변',()=>0)<=500,'Subsequent bubble delay must be fast and natural');
assert(timing.subsequentBubbleDelay(long,()=>1)<=800,'Subsequent bubble delay must not exceed 800ms');
assert.deepEqual(timing.splitIntoRealisticBubbles('너무 노골적이면 좀 부담스럽겠지만, 적당히 선 넘나들면서 적극적인 거면 얘기가 좀 다르죠'), ['너무 노골적이면 좀 부담스럽겠지만, 적당히 선 넘나들면서 적극적인 거면 얘기가 좀 다르죠'], 'Comma clause must not be awkwardly severed into disconnected bubble');
assert.deepEqual(timing.splitIntoRealisticBubbles('응 그래'), ['응 그래'], 'Short single sentence stays 1 bubble');
assert.deepEqual(timing.splitIntoRealisticBubbles('오늘 날씨 너무 좋다! 우리 이따 한강 갈래?'), ['오늘 날씨 너무 좋다!', '우리 이따 한강 갈래?'], 'Punctuated sentences split into 2 natural bubbles');
assert.deepEqual(timing.splitIntoRealisticBubbles('첫 번째 말풍선입니다\n두 번째 말풍선이에요'), ['첫 번째 말풍선입니다', '두 번째 말풍선이에요'], 'Newline split into natural bubbles');
assert.equal(timing.splitIntoRealisticBubbles('더 이상 너 같은 사람 상대하는 거 시간 낭비라는 거 확실히 알았어 다신 보지 말자').length, 2, 'Long Korean sentence without punctuation splits into 2 bubbles');
(async()=>{
 for(const file of ['index.html','seollem_chat_standalone.html']){
  const html=fs.readFileSync(path.resolve(__dirname,'../..',file),'utf8');
  for(const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)){if(/type=["']application\/ld\+json["']/i.test(match[1]))continue;new vm.Script(match[2]);}
  const start=html.indexOf('    async function runRealisticReplySequence('),end=html.indexOf('    // 매 턴마다',start);
  let timers=[],messages=[];
  const state={currentChar:{name:'테스트'},roomLeft:false,messageTurnId:7};
  const context=vm.createContext({AzitChatTiming:timing,state,Date,Math,console,headerStatusText:{},clearIdleFollowUpTimer(){},markAllUserMessagesRead(){},showTypingIndicator(){},hideTypingIndicator(){},saveAccountState(){},updateHeaderDefaultStatus(){},scheduleIdleFollowUp(){},appendMessage(sender,text){messages.push({sender,text});},registerTimeout(fn,delay){timers.push({fn,delay});}});
  vm.runInContext(html.slice(start,end),context);
  const pending=context.runRealisticReplySequence({bubbles:[long],replyId:'test_reply'},false,7,Date.now()-60000);
  assert.equal(messages.length,0,'Reply must stay hidden while typing');assert.equal(timers.length,1);assert(timers[0].delay>=1000&&timers[0].delay<=2000);
  timers.shift().fn();await pending;assert.equal(messages.length,1);assert.equal(messages[0].text,long,'Timing must not truncate text');
  messages=[];timers=[];
  const greeting=context.runRealisticReplySequence({bubbles:[long],replyId:'first',greeting:true},false,7,Date.now()-10000);
  assert.equal(messages.length,0);assert.equal(timers[0].delay,0,'Even a long AI greeting must display promptly once generated');
  timers.shift().fn();await greeting;assert.equal(messages[0].text,long,'Fast greeting must preserve the full actual AI text');
  messages=[];timers=[];
  const multi=context.runRealisticReplySequence({bubbles:['첫 번째 말풍선','두 번째 말풍선'],replyId:'multi'},false,7,Date.now()-5000);
  assert.equal(timers.length,1);
  timers.shift().fn(); // 첫 번째 말풍선 타이핑 대기 완료
  await new Promise(r=>setImmediate(r));
  assert.equal(messages.length,1);assert.equal(messages[0].text,'첫 번째 말풍선');
  assert(timers.length>=1,'Subsequent delay must be registered');
  timers.shift().fn(); // 버블 간 미세 호흡 완료
  await new Promise(r=>setImmediate(r));
  assert(timers.length>=1,'Second bubble typing delay must be registered');
  assert(timers[0].delay<=800,'Second bubble delay must not exceed 800ms');
  timers.shift().fn(); // 두 번째 말풍선 타이핑 대기 완료
  await multi;
  assert.equal(messages.length,2);assert.equal(messages[1].text,'두 번째 말풍선');
  messages=[];timers=[];const stale=context.runRealisticReplySequence({bubbles:[short]},false,7);state.messageTurnId=8;timers.shift().fn();await stale;assert.equal(messages.length,0,'Stale delayed reply must not appear in another turn');
 }
 console.log('PASS: length-based typing, long replies wait even after slow generation, no early display, no text truncation, stale turn cancellation and frontend syntax');
})().catch(e=>{console.error(e);process.exitCode=1;});
