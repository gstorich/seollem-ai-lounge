const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const timing=require('../../chatTiming');
const short='이제 퇴근했어요?',long='긴 답변도 충분한 입력 시간을 가져야 합니다. '.repeat(8);
assert(timing.typingDuration(short,()=>0)>=600&&timing.typingDuration(short,()=>0)<=1200,'Short replies must type quickly without artificial floor');
assert(timing.typingDuration(long,()=>0)>=6000&&timing.typingDuration(long,()=>0)<=10000,'Long replies must finish within realistic bounds');
assert(timing.typingDuration('가'.repeat(10000),()=>1)<=10000,'Capped typing time must not exceed 10s');
assert(timing.remainingDelay(long,60000,()=>0)>=1000&&timing.remainingDelay(long,60000,()=>0)<=2000,'Slow model response must finish with a natural short beat');
assert.equal(timing.greetingRemainingDelay(5000),0,'Provider latency must not be followed by artificial greeting typing');
assert.equal(timing.greetingRemainingDelay(100),0,'Greeting displays immediately once generated');
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
  messages=[];timers=[];const stale=context.runRealisticReplySequence({bubbles:[short]},false,7);state.messageTurnId=8;timers.shift().fn();await stale;assert.equal(messages.length,0,'Stale delayed reply must not appear in another turn');
 }
 console.log('PASS: length-based typing, long replies wait even after slow generation, no early display, no text truncation, stale turn cancellation and frontend syntax');
})().catch(e=>{console.error(e);process.exitCode=1;});
