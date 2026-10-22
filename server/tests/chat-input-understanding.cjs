const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'azit-input-understanding-'));
Object.assign(process.env,{NODE_ENV:'test',DATABASE_FILE:path.join(dir,'db.json'),SQLITE_FILE:path.join(dir,'db.sqlite'),GEMINI_API_KEY:'synthetic-test-key',OPENAI_API_KEY:''});
require('./mock-llm.cjs');
const mock=global.fetch,captured=[];
global.fetch=async(url,options)=>{const payload=JSON.parse(options.body);if(!payload.systemInstruction.parts[0].text.includes('[콘텐츠 안전 분류 전용]'))captured.push(payload);return mock(url,options);};
const llm=require('../services/llmService'),context=require('../services/conversationContext'),characters=require('../services/characterService'),db=require('../services/dbService');
(async()=>{try{
 for(const [index,input]of ['gd','dkssud','요즘 GD 공연 영상 보고 있어','내가 쓴 마릉ㄹ 알아듣겠어?'].entries()){
  const history=[{id:'past-user',role:'user',content:'우리 아까 빵 이야기하다 말았잖아',createdAt:Date.now()-10000},{id:'past-ai',role:'assistant',content:'응 다음에 무슨 빵 구울지 고민 중이야ㅋㅋ',createdAt:Date.now()-9000},{id:'user-'+index,role:'user',content:input,createdAt:Date.now()}];
  const conversation=context.prepare(history,null,{replyId:'reply_'+index,kind:'chat',speechRegister:'casual'});
  const before=captured.length;const result=await llm.generateReply(characters.getCharacterById('chaewon'),history,{conversation});assert(result.isAiGenerated);
  const turn=captured.slice(before).find(p=>p.generationConfig.responseSchema.properties.reply);
  assert.equal(turn.contents.at(-1).parts[0].text,input,'Original user message reaches the provider unchanged');
  assert.equal(turn.contents[1].parts[0].text,history[1].content,'Prior exchange is retained');
  const prompt=turn.systemInstruction.parts[0].text;
  assert(prompt.includes(context.inputUnderstandingInstruction));assert(prompt.includes('두벌식 한영키'));assert(prompt.includes('해석의 확신이 낮고'));assert(prompt.includes('음악·가수 맥락의 "GD"'));assert(prompt.includes('첫 만남으로 초기화하지'));assert(prompt.includes('확정 저장하지'));
  const memory=captured.slice(before).find(p=>p.systemInstruction.parts[0].text.includes('[기억 기록 전용]'));assert(memory.systemInstruction.parts[0].text.includes(context.inputUnderstandingInstruction));
 }
 console.log('PASS: typo/keyboard-layout interpretation, artist-name ambiguity, preserved raw input and dialogue history, no inferred typo facts in memory, provider-only reply pipeline');
}finally{db.sql.close();fs.rmSync(dir,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1;});
