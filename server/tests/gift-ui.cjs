const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
async function scenario(file,fail=false){
 const html=fs.readFileSync(path.resolve(__dirname,'../..',file),'utf8'),start=html.indexOf('    async function sendGiftToCurrentChar('),end=html.indexOf('    function triggerSavedRoomsTimeGreetings(',start);
 let resolve,reject,plan,notices=0,saved=0;const pending=new Set(),calls=[];
 const state={currentChar:{id:'test',name:'테스트'},roomLeft:false,isAiBusy:false,hearts:1000,messages:[]};
 const provider=new Promise((a,b)=>{resolve=a;reject=b;});
 const context=vm.createContext({state,crypto:require('node:crypto'),GIFT_CATALOG:{coffee:{key:'coffee',name:'커피',cost:300}},window:{ApiClient:{isConnected:()=>true}},ApiClient:{sendGift:()=>provider},document:{getElementById:()=>({classList:{add(){}}})},chatContainer:{querySelector(selector){const id=selector.match(/data-msg-id="([^"]+)"/)?.[1];return pending.has(id)?{remove(){pending.delete(id);}}:null;}},appendMessage(sender,text,options){calls.push({sender,text,options});if(options.pendingGift)pending.add(options.id);if(!options.skipPush)state.messages.push({id:options.id,sender,text});},rememberConfirmedReply(){},saveAccountState(){saved++;},updateAccountAndCreditUI(){},showTypingIndicator(){},hideTypingIndicator(){},updateHeaderDefaultStatus(){},openHeartNeededModal(){},showContentAccessNotice(){return false;},showGenerationError(){notices++;},async runRealisticReplySequence(value){plan=value;}});
 vm.runInContext(html.slice(start,end),context);
 const request=context.sendGiftToCurrentChar('coffee','','gift_ui');
 assert.equal(calls.length,1);assert.equal(calls[0].options.pendingGift,true);assert.equal(calls[0].options.skipPush,true);assert.equal(state.messages.length,0);assert.equal(state.hearts,1000);assert.equal(saved,0,'Unconfirmed gift cannot become a durable completed gift');
 if(fail)reject(Error('Provider unavailable'));else resolve({isAiGenerated:true,partnerReply:'하나\n둘\n셋\n넷',replyBubbles:['하나','둘','셋','넷'],replyId:'reply_ui',giftMessageId:'gift_ui',heartsRemaining:700});
 await request;assert.equal(pending.size,0);assert.equal(state.isAiBusy,false);
 if(fail){assert.equal(notices,1);assert.equal(state.hearts,1000);assert.equal(state.messages.length,0);assert.equal(plan,undefined);}else{assert.equal(state.hearts,700);assert(plan.gift);assert.equal(plan.bubbles.length,4);assert.equal(plan.characterId,'test');assert.equal(state.messages.length,1);}
}
(async()=>{for(const file of ['index.html','seollem_chat_standalone.html']){await scenario(file);await scenario(file,true);}console.log('PASS: immediate pending gift feedback, no optimistic charge or completed-gift persistence, API-only four-bubble reaction and cleanup on success/failure in both entrypoints');})().catch(e=>{console.error(e);process.exitCode=1;});
