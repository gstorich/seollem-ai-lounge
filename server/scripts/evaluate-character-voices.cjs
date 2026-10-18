// Opt-in provider evaluation with invented conversations only. No account/DB or
// push delivery imports, no wallet writes, no runtime customer transcripts.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
if(!process.argv.includes('--live'))throw Error('Pass --live for real provider calls');
const behavior=require('../services/characterBehavior'),characters=require('../services/characterService');
const serviceRoot=process.env.REVIEW_BASELINE_ROOT||path.resolve(__dirname,'../services');
const llm=require(path.join(serviceRoot,'llmService')),context=require(path.join(serviceRoot,'conversationContext')),relationship=require(path.join(serviceRoot,'relationshipContext'));
const greetingsOnly=process.argv.includes('--greetings-only');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'azit-character-review-'));console.log(JSON.stringify({reviewDirectory:dir,baseline:Boolean(process.env.REVIEW_BASELINE_ROOT),greetingsOnly}));
const wanted=['dry','brat','bold','aloof','awkward','candid','chaotic','competitive','practical','guarded'];
const catalog=characters.getAllCharacters().map(c=>characters.getCharacterById(c.id));
const selected=[];
for(const key of wanted)for(const gender of ['male','female']){
 const character=catalog.find(c=>c.gender===gender&&behavior.getProfile(c).key===key);
 if(character)selected.push(character);
}
const inputs=['그냥 심심해서 들어왔어 넌?','난 민초 좋아해 너도 좋아하지?','아까 네 취향이 뭐라고 했지? 너 생각이 궁금한 거야','놀리는 건 그만하고 존댓말로 해주세요 웃음 표시도 빼주세요'];
const results=[];
async function review(character){
 let memory=null,history=[];
 const profile=behavior.getProfile(character);
 for(let turn=0;turn<(greetingsOnly?1:inputs.length+1);turn++){
   const id='synthetic_'+character.id+'_'+turn,replyId='reply_'+id;
   const input=turn?inputs[turn-1]:'새로 연결된 낯선 상대에게 이 캐릭터답게 짧은 첫 메시지를 보내세요. 상대는 아직 말하지 않았습니다.';
   const message={id,role:'user',content:input,createdAt:Date.now()};
   const rel=relationship.buildRelationshipContext(character,[...history,...(turn?[message]:[])]);
   const conversation=context.prepare([...history,message],memory,{kind:turn?'chat':'greeting',replyId,speechRegister:rel.speechRegister});
   const started=Date.now();
   const output=await llm.generateReply(character,[...history,message],{conversation,relationship:rel,greeting:turn===0});
   if(!output.isAiGenerated||!output.text?.trim())throw Error('Invalid synthetic generation');
   memory=output.memory;
   if(turn)history.push(message);
   history.push({id:replyId,role:'assistant',content:output.text,createdAt:Date.now()});
   const item={characterId:character.id,name:character.name,gender:character.gender,trait:character.traitKey,profile,turn,input:turn?input:null,reply:output.text,latency:Date.now()-started,roomLeft:output.roomLeft};
   results.push(item);fs.appendFileSync(path.join(dir,'results.jsonl'),JSON.stringify(item)+'\n');
 }
}
(async()=>{
 // Three independent synthetic characters at a time, each with ordered turns.
 for(let i=0;i<selected.length;i+=3){
   const batch=await Promise.allSettled(selected.slice(i,i+3).map(review));
   for(const result of batch)if(result.status==='rejected')throw result.reason;
   console.log(JSON.stringify({completedCharacters:Math.min(i+3,selected.length),totalCharacters:selected.length}));
 }
 const first=results.filter(x=>x.turn===0);
 console.log(JSON.stringify({reviewDirectory:dir,calls:results.length,characters:first.length,uniqueGreetings:new Set(first.map(x=>x.reply)).size,stockGreetingCount:first.filter(x=>/반가워요|오늘 하루|편하게 이야기|편하게 얘기/.test(x.reply)).length}));
})().catch(error=>{console.error('Synthetic review failed:',error.message);process.exitCode=1;});
