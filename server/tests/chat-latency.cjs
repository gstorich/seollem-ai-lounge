const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'azit-parallel-chat-'));
Object.assign(process.env,{NODE_ENV:'test',DATABASE_FILE:path.join(dir,'db.json'),SQLITE_FILE:path.join(dir,'db.sqlite'),GEMINI_API_KEY:'isolated-latency-test',GEMINI_MODEL:'gemini-3.1-flash-lite',OPENAI_API_KEY:''});
require('./mock-llm.cjs');
const simulatedFetch=global.fetch;let memoryStarted=false,releaseOutput,timeout;
const memoryReady=new Promise((resolve,reject)=>{releaseOutput=resolve;timeout=setTimeout(()=>reject(Error('Output validation serialized the memory call')),1000);});memoryReady.catch(()=>{});
global.fetch=async(url,options)=>{
 const body=JSON.parse(options.body),prompt=body.systemInstruction.parts[0].text;
 const recording=prompt.includes('[기억 기록 전용]'),moderation=prompt.includes('[콘텐츠 안전 분류 전용]');
 assert.equal(body.generationConfig.thinkingConfig.thinkingLevel,moderation?'LOW':'MINIMAL');
 if(recording){memoryStarted=true;releaseOutput();}
 if(moderation&&JSON.parse(body.contents.at(-1).parts[0].text).target.startsWith('오늘 이야기 즐거웠어요')){await memoryReady;assert(memoryStarted);}
 return simulatedFetch(url,options);
};
(async()=>{try{
 const llm=require('../services/llmService'),characters=require('../services/characterService');
 const result=await llm.generateReply(characters.getCharacterById('chaewon'),[{role:'user',content:'오늘 편하게 수다 떨자'}]);
 assert(result.isAiGenerated);assert(memoryStarted);assert(result.memory);
 console.log('PASS: normal chat writer uses minimal thinking, safety retains LOW and memory uses minimal thinking, output validation overlaps memory and both complete before return');
 }finally{clearTimeout(timeout);require('../services/dbService').sql.close();fs.rmSync(dir,{recursive:true,force:true});}})().catch(error=>{console.error(error);process.exitCode=1;});
