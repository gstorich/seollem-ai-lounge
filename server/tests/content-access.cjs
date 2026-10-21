const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'azit-content-access-'));
Object.assign(process.env,{NODE_ENV:'test',GEMINI_API_KEY:'synthetic',OPENAI_API_KEY:'',SQLITE_FILE:path.join(dir,'db.sqlite'),DATABASE_FILE:path.join(dir,'db.json')});
require('./mock-llm.cjs');
const access=require('../services/contentAccess'),llm=require('../services/llmService'),characters=require('../services/characterService');
const general=Object.fromEntries(access.schema.required.map(k=>[k,false]));
(async()=>{try{
 assert.doesNotThrow(()=>access.enforce(general,false));
 assert.throws(()=>access.enforce({...general,adultTransition:true},false),/ADULT_VERIFICATION_REQUIRED/);
 assert.doesNotThrow(()=>access.enforce({...general,adultTransition:true},true));
 for(const key of ['explicitContent','sexualMinors','nonConsensualSex','realPersonSexualization','seriousHarm'])assert.throws(()=>access.enforce({...general,[key]:true},true),/CONTENT_NOT_ALLOWED/,key);
 assert.throws(()=>access.enforce({sexualContent:false,explicitContent:false,sexualMinors:false},true),/LLM_INVALID_SAFETY/,'Old or incomplete classifications fail closed');
 const character=characters.getAllCharacters()[0];
 // A certified account does not authorize unsolicited adult follow-up messages.
 await assert.rejects(()=>llm.generateReply(character,[{role:'user',content:'unsafe-writer-test'}],{verifiedAdult:true,conversation:require('../services/conversationContext').prepare([{id:'followup',role:'user',content:'unsafe-writer-test'}],null,{kind:'proactive',replyId:'test'})}),e=>e.message==='ADULT_VERIFICATION_REQUIRED'&&e.safetyStage==='output');
 // Greeting candidates have the same output gate even without user input checks.
 await assert.rejects(()=>llm.generateReply(character,[{role:'user',content:'unsafe-writer-test'}],{greeting:true,verifiedAdult:false}),e=>e.message==='ADULT_VERIFICATION_REQUIRED'&&e.safetyStage==='output');
 console.log('PASS access boundaries: ordinary romance allowed, contextual entry gate, common prohibitions, incomplete checks closed, greeting and unsolicited follow-up output gates');
}finally{fs.rmSync(dir,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1;});
