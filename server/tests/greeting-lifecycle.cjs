const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
let html;
for(const file of ['index.html','seollem_chat_standalone.html']){
html=fs.readFileSync(path.resolve(__dirname,'../..',file),'utf8');
assert(!html.includes('checkAndProcessPendingUserMessages('),'Both entrypoints must call an existing pending-message handler');
}
html=fs.readFileSync(path.resolve(__dirname,'../../index.html'),'utf8');
function section(from,to){const start=html.indexOf(from),end=html.indexOf(to,start);assert(start>=0&&end>start);return html.slice(start,end);}
const greeting=section('    async function deliverFirstGreeting(', '    async function startChatWithCharacter(');
const pending=section('    async function processPendingUserMessagesNow(', '    async function sendUserMessage(');
async function scenario(queue=[],fail=false){
 const char={id:'test-character',name:'테스트'},displayed=[],sent=[],notices=[];
 const state={savedRooms:{},currentChar:char,pendingUserMessages:queue,isAiBusy:false,isGreetingPending:false};
 const api={isConnected:()=>true,async sendGreeting(){if(fail)throw Error('Provider failure');return {isAiGenerated:true,partnerReply:'실제 API 첫 메시지',replyId:'reply_greeting'};}};
 const context=vm.createContext({AzitMessageDelivery:require('../../messageDelivery'),saveAccountState(){},renderChatRoomsList(){},updateChatListBadges(){},state,window:{ApiClient:api},ApiClient:api,Date,Math,headerStatusText:{},showTypingIndicator(){},hideTypingIndicator(){},updateHeaderDefaultStatus(){},async runRealisticReplySequence(plan){displayed.push(plan.bubbles[0]);},async executeUserMessageTurn(text,requestId,c){sent.push({text,requestId,charId:c.id});},showContentAccessNotice(){return false;},showGenerationError(){notices.push('error');}});
 const persist=section('    function rememberConfirmedReply(', '    function flushPendingDeliveryForChar(');
 vm.runInContext(persist+'\n'+pending+'\n'+greeting,context);
 await context.deliverFirstGreeting(char,'greet-test');
 return {state,displayed,sent,notices};
}
(async()=>{
 const ok=await scenario();assert.deepEqual(ok.displayed,['실제 API 첫 메시지']);assert.equal(ok.state.savedRooms['test-character'].messages[0].text,'실제 API 첫 메시지');assert.equal(ok.notices.length,0,'Successful first greeting must not show a generation error');assert.equal(ok.state.isAiBusy,false);assert.equal(ok.state.isGreetingPending,false);
 const queued=await scenario([{charId:'test-character',text:'안녕',requestId:'user-1'},{charId:'test-character',text:'반가워',requestId:'user-2'}]);assert.equal(queued.sent.length,1);assert.equal(queued.sent[0].text,'안녕\n반가워');assert.equal(queued.sent[0].requestId,'user-2');assert.equal(queued.notices.length,0);assert.equal(queued.state.pendingUserMessages.length,0);
 const failed=await scenario([],true);assert.equal(failed.displayed.length,0,'Provider failure must never fabricate a character reply');assert.equal(failed.notices.length,1);assert.equal(failed.state.isAiBusy,false);
 console.log('PASS: first greeting completes without a false error, queued user messages continue after greeting, provider failure stays a system notice');
})().catch(e=>{console.error(e);process.exitCode=1;});
