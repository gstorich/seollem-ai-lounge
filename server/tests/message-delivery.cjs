const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),delivery=require('../../messageDelivery');
const html=fs.readFileSync(path.resolve(__dirname,'../../index.html'),'utf8');
function section(from,to){const start=html.indexOf(from),end=html.indexOf(to,start);assert(start>=0&&end>start);return html.slice(start,end);}
function scenario(){let saved;const char={id:'room-a'},state={currentChar:char,currentView:'chatRoom',messages:[{id:'user-1',sender:'user',text:'안녕',createdAt:1}],savedRooms:{},userFacts:[],metCharIds:[],activePendingDeliveries:{}};
 const context=vm.createContext({AzitMessageDelivery:delivery,state,Date,serverStateReady:true,window:{ApiClient:{isHosted:()=>true}},ApiClient:{saveState(p){saved=JSON.parse(JSON.stringify(p));}},compressOldMessagesIntoMemory(){},updateAccountAndCreditUI(){},renderChatRoomsList(){},updateChatListBadges(){},CHARACTERS:[char],getStorageKeyForAccount(){}});
 vm.runInContext(section('    function saveAccountState()','    function loadAccountState()')+'\n'+section('    function rememberConfirmedReply(','    // 창에서 벗어났을 때도'),context);return {context,state,get saved(){return saved;}};
}
const full={replyId:'reply_provider-1',partnerReply:'첫 번째 말풍선 두 번째 말풍선 마지막 말풍선'};
let s=scenario();s.context.rememberConfirmedReply(s.state.currentChar,full);assert.equal(s.saved.savedRooms['room-a'].messages.at(-1).text,full.partnerReply,'Complete reply is durable before any typing');
s.state.messages.push({id:full.replyId+'_0',sender:'ai',text:'첫 번째 말풍선',createdAt:2});s.state.currentView='chatList';s.context.saveAccountState();assert(s.saved.savedRooms['room-a'].messages.some(m=>m.id===full.replyId&&m.text===full.partnerReply),'Leaving during first bubble cannot replace full reply with partial screen');assert(!s.saved.savedRooms['room-a'].messages.some(m=>m.id===full.replyId+'_0'),'Bubble fragments cannot duplicate the canonical reply');
s.state.activePendingDeliveries['room-a']={replyId:full.replyId,fullText:full.partnerReply,bubbles:['두 번째 말풍선','마지막 말풍선']};s.context.flushPendingDeliveryForChar('room-a');assert.equal(s.saved.savedRooms['room-a'].messages.filter(m=>m.sender==='ai').length,1);assert.equal(s.saved.savedRooms['room-a'].messages.at(-1).text,full.partnerReply,'Pagehide flush retains full text after queue shrinks');
s.state.currentChar={id:'room-b'};s.state.messages=[];s.context.rememberConfirmedReply({id:'room-a'},{replyId:'reply_late',partnerReply:'화면 이동 중 도착한 실제 답변'});assert(s.saved.savedRooms['room-a'].messages.some(m=>m.id==='reply_late'));assert(!s.saved.savedRooms['room-b'],'Late response never appears in another room');
s=scenario();const left={id:'system_left_reply_terminal',sender:'system',systemKind:'partner_left',text:'상대방이 대화방을 나갔습니다.',createdAt:4};
s.context.rememberConfirmedReply(s.state.currentChar,{replyId:'reply_terminal',partnerReply:'여기까지 할게',replyCreatedAt:3,roomLeft:true,systemMessages:[left]});
assert(s.saved.savedRooms['room-a'].roomLeft,'Departure is durable before typing finishes');assert(s.saved.savedRooms['room-a'].messages.some(m=>m.id===left.id));
s.state.roomLeft=true;s.state.messages.push(left);s.context.saveAccountState();assert(s.saved.savedRooms['room-a'].roomLeft);assert.equal(s.saved.savedRooms['room-a'].messages.filter(m=>m.id===left.id).length,1,'Closed room retains one system notice after saving and reentry');
console.log('PASS: persist before typing, navigation during partial delivery, canonical deduplication, pagehide/reload flush and late reply room ownership');

// Exercise the actual appendMessage presentation boundary in both entrypoints.
for(const file of ['index.html','seollem_chat_standalone.html']){
 const source=fs.readFileSync(path.resolve(__dirname,'../..',file),'utf8');
 const from=source.indexOf('      // Server recovery and delayed bubble delivery can race;');
 const to=source.indexOf('      const timeStr = options.time || getFormatTime();',from);
 assert(from>=0&&to>from);
 let rows=[];
 const context=vm.createContext({AzitMessageDelivery:delivery,chatContainer:{querySelectorAll(){return rows;}},record(sender,text,options){
  const row={dataset:{msgId:options.id},text,remove(){rows=rows.filter(item=>item!==row);}};rows.push(row);
 }});
 vm.runInContext('function appendMessage(sender,text,options={}){'+source.slice(from,to)+'record(sender,text,options);}',context);
 const append=(id,text,bubbles)=>context.appendMessage('ai',text,{id,skipPush:!!bubbles,bubbles});
 // Sync/reentry recovers the complete reply before the animation resumes.
 append('reply_race','first second');append('reply_race_0','first');append('reply_race_1','second');
 assert.deepEqual(rows.map(row=>row.text),['first second'],file+': recovered response suppresses late fragments');
 rows=[];
 // Recovery can also finish between the first and second animated bubbles.
 append('reply_race_0','first');append('reply_race','first second');append('reply_race_1','second');
 assert.deepEqual(rows.map(row=>row.text),['first second'],file+': canonical reply replaces partial animation');
 rows=[];
 append('reply_gift','one two three',['one','two','three']);
 append('reply_gift_0','one');append('reply_gift_1','two');append('reply_gift_2','three');
 assert.deepEqual(rows.map(row=>row.text),['one','two','three'],file+': restored gift bubbles cannot animate a second time');
 append('reply_other','one');assert.equal(rows.length,4,'Distinct replies with equal text remain visible');
}
console.log('PASS: canonical/fragment DOM races, resumed animations and restored gift deduplication in both entrypoints');
