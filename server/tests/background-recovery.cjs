const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.resolve(__dirname,'../..'),delivery=require('../../messageDelivery');
function events(){const listeners=new Map();return {addEventListener(k,fn){if(!listeners.has(k))listeners.set(k,new Set());listeners.get(k).add(fn);},removeEventListener(k,fn){listeners.get(k)?.delete(fn);},emit(k){for(const fn of listeners.get(k)||[])fn();}};}
(async()=>{
 const document={...events(),visibilityState:'hidden'},window={...events(),location:{protocol:'https:',origin:'https://test.invalid'}};
 const context=vm.createContext({window,document,localStorage:{getItem:()=> 'session-token'},setTimeout(fn){queueMicrotask(fn);return 1;},clearTimeout(){},AbortSignal,Date,console});
 vm.runInContext(fs.readFileSync(path.join(root,'apiClient.js'),'utf8'),context);
 const api=window.ApiClient;let posts=0,gets=0;
 api.request=async(route)=>{if(route==='/chat/send'){posts++;throw new TypeError('Failed to fetch');}gets++;return gets===1?{state:'pending'}:{state:'completed',result:{replyId:'reply_one',isAiGenerated:true,partnerReply:'서버에서 완료한 답변'}};};
 const pending=api.generatedRequest('/chat/send',{messageId:'one',characterId:'chaewon'});await new Promise(r=>setImmediate(r));assert.equal(gets,0,'Suspended Chrome waits for visibility before recovering');
 document.visibilityState='visible';document.emit('visibilitychange');const result=await pending;
 assert.equal(result.replyId,'reply_one');assert.equal(posts,1,'Receipt polling never creates another paid turn');assert.equal(gets,2);
 api.request=async(route)=>{if(route==='/chat/send')throw new TypeError('offline');return {state:'unknown'};};
 await assert.rejects(api.generatedRequest('/chat/send',{messageId:'missing',characterId:'chaewon'}),e=>e.code==='DELIVERY_UNCONFIRMED','Unknown delivery must not be labelled a generation failure');
 gets=0;api.request=async()=>{gets++;throw Object.assign(Error('provider failed'),{status:503,code:'AI_GENERATION_FAILED'});};
 await assert.rejects(api.generatedRequest('/chat/send',{}),e=>e.code==='AI_GENERATION_FAILED');assert.equal(gets,1,'A confirmed provider failure stays visible');
 api.request=async(route)=>route==='/chat/send'?Promise.reject(new TypeError('lost response')):{state:'failed',failure:{error:'CONTENT_NOT_ALLOWED',message:'blocked',costDeducted:0}};
 await assert.rejects(api.generatedRequest('/chat/send',{messageId:'blocked',characterId:'chaewon'}),e=>e.code==='CONTENT_NOT_ALLOWED');
 const merged=delivery.merge([{id:'first',sender:'user',awaitingReply:true,failed:true},{id:'one',sender:'user',awaitingReply:true,isFailed:true},{id:'system_error_one',sender:'system',systemKind:'generation_error',requestId:'one'}],[{id:'first',sender:'user',awaitingReply:false},{id:'one',sender:'user',awaitingReply:false},{id:'reply_one',sender:'ai',text:'done'}]);
 assert(merged.filter(m=>m.sender==='user').every(m=>!m.failed&&!m.isFailed&&!m.awaitingReply));assert(!merged.some(m=>m.systemKind==='generation_error'));
 for(const file of ['index.html','seollem_chat_standalone.html']){
  const html=fs.readFileSync(path.join(root,file),'utf8');
  function section(a,b){const start=html.indexOf(a),end=html.indexOf(b,start);assert(start>=0&&end>start);return html.slice(start,end);}
  let removed=0;const appended=[],succeeded=[];const stale={id:'system_error_one',sender:'system',systemKind:'generation_error',requestId:'one'};
  const state={currentChar:{id:'chaewon'},currentView:'chatRoom',isAiBusy:true,isGreetingPending:true,messages:[{id:'one',sender:'user',awaitingReply:true,failed:true},stale],savedRooms:{chaewon:{messages:[]}}};
  const rows=[{dataset:{msgId:stale.id},remove(){removed++;}}];
  const api={user:{id:'account'},isConnected:()=>true,async loadConversationUpdates(){return {syncVersion:'version2',user:{hearts:46.3},savedRooms:{chaewon:{messages:[{id:'one',sender:'user',awaitingReply:false},{id:'reply_one',sender:'ai',text:'done'}]}}};}};
  const sandbox=vm.createContext({state,document:{...events(),visibilityState:'visible'},window:{...events(),ApiClient:api},ApiClient:api,serverStateReady:true,AzitMessageDelivery:delivery,CHARACTERS:[],chatContainer:{querySelectorAll:()=>rows,scrollHeight:100,scrollTop:0,clientHeight:100},markUserMessageSucceeded(id){succeeded.push(id);},appendMessage(sender,text,m){appended.push(m.id);},saveAccountState(){},renderChatRoomsList(){},updateChatListBadges(){},clearIdleFollowUpTimer(){},setInterval(){}});
  vm.runInContext(section('    let conversationSyncAfter=0,conversationSyncBusy=false;','    function applyServerAccount('),sandbox);
  await sandbox.syncServerConversations();assert.equal(removed,1);assert(appended.includes('reply_one'));assert(succeeded.includes('one'));assert(!state.messages.some(m=>m.systemKind==='generation_error'));assert.equal(state.messages.find(m=>m.id==='one').failed,false,'Busy state cannot hide server confirmation');
  let failed=0;
  // The actual failure helper must not touch DOM/storage for an answered message.
  const guard=vm.createContext({state,chatContainer:{querySelector(){failed++;}},saveAccountState(){failed++;}});vm.runInContext(section('    function markUserMessageFailed(','    function markUserMessageSucceeded('),guard);guard.markUserMessageFailed('one','late error');assert.equal(failed,0);
  const idle=section('    function scheduleIdleFollowUp()','    async function runRealisticReplySequence(');assert(!idle.includes('showGenerationError('));assert(idle.includes("document.visibilityState!=='visible'"));
 }
 console.log('PASS: hidden/resumed HTTP loss, receipt-only recovery, unknown vs confirmed failure, batch flags, active/busy sync, obsolete notice removal, no late failure rollback, no failed user badge from optional contact');
})().catch(e=>{console.error(e);process.exitCode=1;});
