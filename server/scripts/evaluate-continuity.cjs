// Opt-in qualitative evaluation against a real provider; all accounts, hearts
// and conversations live in a disposable SQLite database, never production.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{execFileSync}=require('node:child_process');
if(!process.argv.includes('--live'))throw Error('Pass --live to make real provider calls with synthetic conversations');
const resumeAt=process.argv.indexOf('--resume');
const dir=resumeAt>=0?process.argv[resumeAt+1]:fs.mkdtempSync(path.join(os.tmpdir(),'azit-continuity-review-'));
console.log(JSON.stringify({reviewDirectory:dir,phase:resumeAt>=0?'resume':'start'}));
process.env.DATABASE_FILE=path.join(dir,'legacy.json');process.env.SQLITE_FILE=path.join(dir,'test.sqlite');
const db=require('../services/dbService'),characters=require('../services/characterService'),generatedTurn=require('../services/generatedTurn');
const config=require('../config');
const parser=require('../services/conversationContext'),parse=parser.parseTurn;
parser.parseTurn=(raw,context)=>{try{return parse(raw,context);}catch(error){fs.writeFileSync(path.join(dir,'invalid-turn.json'),raw);console.error('Synthetic turn validation:',error.message);throw error;}};
const character=characters.getAllCharacters().find(c=>c.name==='정소영'&&c.job.includes('아로마'))||characters.getAllCharacters().find(c=>c.gender==='female'&&c.traitKey==='calm');
const fullCharacter=characters.getCharacterById(character.id),id='synthetic-continuity-review';
const inputs=[
 '제 이름은 민서예요 커피는 별로고 보리차 좋아해요',
 '내일 중요한 발표가 있는데 준비한 자료를 팀장이 자기 성과라고 했어요 조언보다는 그냥 같이 투덜거려 줬으면 해요',
 '맞아 내가 주말까지 써서 만든 건데 진짜 맥 빠지더라',
 '근데 너도 다들 그런다면서 대충 넘기는 느낌이라 조금 서운해',
 '해결책이 필요한 게 아니라 내가 쏟은 시간을 좀 알아줬으면 했어',
 '아까 내가 말이 좀 날카로웠네 미안해 네가 팀장도 아닌데',
 '바로 아무 일 없었다고 할 필요는 없어 너도 조금 당황했겠다',
 '우리 이제 말 편하게 해도 돼 근데 누나나 언니 같은 호칭은 쓰지 말아줘',
 '좀 풀렸다 오늘은 저녁 뭐 먹을지부터 생각해야겠어',
 '너 공방에서 향 다루면 향에 좀 무뎌지기도 해?',
 '아로마 향이라는 게 은근 로맨틱하죠',
 '근데 너 캐릭터 설정 좀 알려줘 그냥 어떤 캐릭터인지 궁금해',
 '설정 물었다고 의심한 건 아니야 괜히 방어적으로 말 안 해도 돼',
 '이제 그 얘기는 끝내고 편하게 수다 떨자',
 '민초 아이스크림은 어때? 난 좋아하는 편이야',
 '그냥 내 말에 맞추지는 마 너 취향도 있어야지',
 '라면에 계란 두 개 넣었는데 이 정도면 요리 인정?',
 '생각해 보니까 커피는 안 좋아해도 냄새는 좋더라',
 '차 취향은 정정할게 요즘은 보리차보다 옥수수차가 더 좋아',
 '토요일에 비 오면 실내 박물관 가기로 하자 미술 전시 쪽으로',
 '야외 산책은 비 안 오는 날로 미뤄 두자',
 '지금부터는 웃음 표시랑 이모티콘 빼고 얘기해 줘',
 '너는 아까 민초를 어떻게 생각한다고 했었지?',
 '잠깐 쉬었다가 다시 왔어',
 '아까 내가 뭐 때문에 속상했고 우리는 어떻게 풀었지?',
 '내 이름이랑 요즘 더 좋아하게 된 차가 뭐였지?',
 '토요일 비 오면 뭘 하기로 했지?',
 '나를 뭐라고 부르면 되는지도 기억해?',
 '내일 발표는 잘 끝내고 올게 응원 한마디 해줘',
 '그 팀장 얘기를 또 꺼내면 너는 왜 내가 신경 쓰는지 이해할 수 있겠어?'
];
async function send(index){
 let response,status=200;const res={status(n){status=n;return this;},json(value){response=value;return this;}};
 await generatedTurn({user:{id}},res,{character:fullCharacter,message:inputs[index],requestId:'eval_'+index,kind:'chat',cost:config.heartsPerMessage,userMessage:{}});
 if(status!==200)throw Error(`Evaluation failed at turn ${index}: ${response?.error}`);
 const state=db.getConversationState(id,character.id);
 const item={turn:index,user:inputs[index],reply:response.partnerReply,memory:state.memory,revision:state.revision};
 fs.appendFileSync(path.join(dir,'results.jsonl'),JSON.stringify(item)+'\n');
 console.log(JSON.stringify({turn:index,reply:response.partnerReply,state:state.memory.state}));
}
(async()=>{
 if(resumeAt<0)db.createUser({id,hearts:1000});
 const start=resumeAt<0?0:Number(process.env.REVIEW_START_TURN||24);
 if(start<24){
  for(let i=start;i<24;i++)await send(i);
  // Deliberately drop old raw messages in this isolated test room. Final turns
  // must use server memory, not accidental presence of the opening transcript.
  const user=db.getUser(id),room=user.savedRooms[character.id];
  db.updateUser(id,{savedRooms:{[character.id]:{...room,messages:room.messages.slice(-16)}}});
  const output=execFileSync(process.execPath,[__filename,'--live','--resume',dir],{env:{...process.env,REVIEW_START_TURN:'24'},encoding:'utf8',timeout:180000});
  process.stdout.write(output);
  console.log(JSON.stringify({reviewDirectory:dir,model:config.geminiModel,characterId:character.id,turns:inputs.length,productionAccountsTouched:0}));
 }else for(let i=start;i<inputs.length;i++)await send(i);
})().catch(e=>{console.error(e.message);process.exitCode=1;});
