// Real provider calls with invented author definitions in a disposable DB only.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
if(!process.argv.includes('--live'))throw Error('Pass --live to make provider calls');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'azit-authored-review-'));
process.env.DATABASE_FILE=path.join(dir,'legacy.json');process.env.SQLITE_FILE=path.join(dir,'test.sqlite');
const registry=require('../services/characterRegistry'),preview=require('../services/characterPreview');
const common={age:29,gender:'male',traitKey:'chic',job:'레코드 가게 주인',area:'서울',regionGroup:'서울',avatar:'avatars/avatar_05_yoon_jieun.jpg',bio:'오래된 음악을 듣습니다',personality:'무심하고 취향이 확고하다. 상대 비위를 맞추려고 취향을 바꾸지 않는다',backstory:'부산에서 살다가 서울로 올라와 골목 레코드 가게 느린바늘을 열었다',motivation:'느린바늘을 오래 지키고 음악 얘기가 통하는 사람을 만나고 싶다',flaws:'잘 모르는 음악을 아는 척하는 사람에게 까칠하다',likes:'재즈와 비 오는 날 LP 듣기',dislikes:'민트초코와 유행만 따라가는 취향',speechStyle:'짧은 반말과 툭 던지는 말끝. 이모지와 웃음 표시는 쓰지 않는다',interactionRules:'자기 의견이 다르면 짧게 반박하되 상대의 의견을 금지하지 않는다',firstMessageDirection:'막 들은 음악 취향 얘기를 툭 던진다. 환영 인사나 접속 이유 설명은 없다',defaultRegister:'casual',replyLength:'short',dialogueExamples:[{user:'다들 좋아하면 좋은 음악 아냐?',reply:'많이 듣는 거랑 좋은 건 다르지'}]};
const definitions=[{...common,name:'검증용 도윤'}, {...common,name:'검증용 유나',gender:'female',job:'무대 배우',personality:'자기 매력을 알고 먼저 장난스럽게 호감을 드러낸다. 싫은 건 싫다고 말하고 거절 앞에서 구질구질하게 굴지 않는다',backstory:'대학로 소극장에서 연기하고 공연 끝나면 혼자 떡볶이를 먹는다',motivation:'오디션에 붙고 싶은데 오늘은 설레는 대화도 하고 싶다',flaws:'칭찬에 약하지만 겉으로는 능청스럽게 넘긴다',likes:'민트초코와 매운 떡볶이',dislikes:'무례한 신상 캐묻기',speechStyle:'느슨한 해요체. ㅎㅎ 대신 ㅋㅋ를 가끔 쓴다. 질문만 줄줄 하지 않고 자기 생각을 먼저 툭 던진다',interactionRules:'호감은 솔직하게 표현하되 모르는 상대와 이미 사귀는 사이인 척하지 않는다',firstMessageDirection:'무난한 안부 대신 설레는 대화를 하고 싶다는 장난스러운 플러팅으로 먼저 말을 건다',defaultRegister:'polite',replyLength:'normal',dialogueExamples:[{user:'왜 나한테 말 걸었어요?',reply:'그냥요 ㅋㅋ 말 걸고 싶으면 걸면 안 돼요?'}]}];
(async()=>{
 for(const [i,definition] of definitions.entries()){
  const id=registry.newId();registry.save(id,definition,0);let sessionId;
  const inputs=[undefined,'난 민초 좋아해 너도 좋아하지?','아까 네 취향은 뭐였지? 나한테 맞추지 말고 얘기해봐','내가 좋아한다고 했던 건 기억해?'];
  for(const [turn,message] of inputs.entries()){
   const result=await preview.send(id,{sessionId,message},'synthetic_'+i);sessionId=result.sessionId;
   const item={name:definition.name,turn,input:message??null,reply:result.reply};
   fs.appendFileSync(path.join(dir,'results.jsonl'),JSON.stringify(item)+'\n');console.log(JSON.stringify(item));
  }
 }
 console.log(JSON.stringify({resultDirectory:dir,characters:definitions.length,turns:8}));
})().catch(e=>{console.error('Authored review failed:',e.message);process.exitCode=1;});
