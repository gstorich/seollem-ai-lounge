const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
(async()=>{for(const file of ['index.html','seollem_chat_standalone.html']){
 const html=fs.readFileSync(path.resolve(__dirname,'../..',file),'utf8');
 const start=html.indexOf('    let userTurnInFlight = false;'),end=html.indexOf('    function updateFilterModalUI()',start);
 const char={id:'batch',name:'테스트'},state={currentChar:char,hearts:100,turnCount:0,messages:[],pendingUserMessages:[],messageTurnId:1};
 let now=10000,id=0,active=0,maxActive=0,release;const timers=new Map(),calls=[],shown=[];
 const context=vm.createContext({state,Date:{now:()=>now},setTimeout(fn,ms){const key=++id;timers.set(key,{fn,ms});return key;},clearTimeout(key){timers.delete(key);},document:{getElementById:()=>({value:'',style:{},remove(){}})},appendMessage(sender,text){state.messages.push({id:'m_'+state.messages.length,sender,text});},saveAccountState(){},clearIdleFollowUpTimer(){},processEmotion(){},headerStatusText:{},showTypingIndicator(){},hideTypingIndicator(){},updateHeaderDefaultStatus(){},updateNotificationBanners(){},openHeartNeededModal(){throw Error('Unexpected insufficient balance');},async fetchLLMResponse(text,requestId,retry,batch){
  active++;maxActive=Math.max(maxActive,active);calls.push({text,requestId,batch});
  if(calls.length===1)await new Promise(resolve=>release=resolve);
  active--;return {bubbles:['응 알겠어'],replyId:'reply_'+requestId};
 },async runRealisticReplySequence(plan){shown.push(plan.replyId);state.isAiBusy=false;}});
 vm.runInContext(html.slice(start,end),context);
 await context.sendUserMessage('오타 아닌데요');await context.sendUserMessage('그냥 이렇게 치는데요');await context.sendUserMessage('제가 원래 귀여운 타입인데요');
 assert.equal(calls.length,0,'Burst is buffered rather than sent per message');
 now+=1001;const first=context.processPendingUserMessagesNow(char);await Promise.resolve();
 assert.equal(calls.length,1);assert.equal(calls[0].text,'오타 아닌데요\n그냥 이렇게 치는데요\n제가 원래 귀여운 타입인데요');assert.equal(calls[0].batch.length,3);
 const turn=state.messageTurnId;
 await context.sendUserMessage('왜요');await context.sendUserMessage('이상하다');
 now+=1001;await context.processPendingUserMessagesNow(char);
 assert.equal(calls.length,1,'New inputs cannot interrupt a live provider request');assert.equal(state.messageTurnId,turn,'Sending during generation does not invalidate its reply');
 release();await first;
 assert.equal(maxActive,1);assert.equal(calls.length,2);assert.equal(calls[1].text,'왜요\n이상하다');assert.equal(calls[1].batch.length,2);assert.equal(shown.length,2);assert.equal(state.pendingUserMessages.length,0);
 // Generation during the first greeting also waits without losing the queued inputs.
 state.isGreetingPending=true;await context.sendUserMessage('안녕');now+=1001;await context.processPendingUserMessagesNow(char);assert.equal(calls.length,2);state.isGreetingPending=false;await context.processPendingUserMessagesNow(char);assert.equal(calls.length,3);
 }
 for(const file of ['index.html','seollem_chat_standalone.html']){
  const html=fs.readFileSync(path.resolve(__dirname,'../..',file),'utf8'),start=html.indexOf('    async function fetchLLMResponse('),end=html.indexOf('    function openPhotoLightbox(',start);
  let calls=0,failed=0,notices=0;const succeeded=[],batch=[{requestId:'one',text:'하나'},{requestId:'two',text:'둘'}],char={id:'batch'},state={currentChar:char,messages:[],affection:0};
  const context=vm.createContext({state,window:{ApiClient:{isConnected:()=>true}},ApiClient:{async sendMessage(...args){calls++;assert.equal(args[5].length,2);if(calls===1)throw Object.assign(Error('pending'),{status:409,code:'GENERATION_PENDING'});return {isAiGenerated:true,partnerReply:'응 들었어',replyId:'reply_two',heartsRemaining:40};}},setTimeout(resolve){resolve();},rememberConfirmedReply(){},updateAccountAndCreditUI(){},markUserMessageSucceeded(id){succeeded.push(id);},markUserMessageFailed(){failed++;},showGenerationError(){notices++;},showContentAccessNotice(){return false;}});
  vm.runInContext(html.slice(start,end),context);const result=await context.fetchLLMResponse('하나\n둘','two',0,batch);
  assert.equal(result.failed,undefined);assert.equal(calls,2);assert.equal(failed,0,'409 pending must never mark a customer message as failed');assert.equal(notices,0);assert.deepEqual(succeeded,['one','two']);
 }
 console.log('PASS: rapid inputs become batches, one in-flight request, inputs during generation drain together, no discarded replies, greeting queue in both entrypoints');
})().catch(error=>{console.error(error);process.exitCode=1;});
