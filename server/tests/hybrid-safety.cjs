'use strict';
const assert=require('node:assert/strict');
Object.assign(process.env,{NODE_ENV:'test',SAFETY_CLASSIFIER:'jev_hybrid',TYPESAFE_API_KEY:'synthetic-key'});
const {classify}=require('../services/safetyClassifier');
const fields=require('../services/contentAccess').schema.required;
const flags=Object.fromEntries(fields.map(k=>[k,false]));
let behavior='clear',fallbacks=0;
global.fetch=async(url,options)=>{
  assert.equal(url,'https://api.typesafe.ai/v1/systemone');
  const p=JSON.parse(options.body);assert.equal(p.model,'jev-1.14.0');
  assert.deepEqual(Object.keys(p.questions),fields);
  assert.equal(p.state.target,'synthetic');
  assert.equal(p.state.context[0].content,'prior context');
  assert.equal(p.state.serverMemory.summary,'prior memory');
  if(behavior==='http')return new Response('{}',{status:429});
  if(behavior==='timeout')return new Promise((resolve,reject)=>{
    const keepAlive=setTimeout(()=>reject(Error('deadline did not fire')),3000);
    options.signal.addEventListener('abort',()=>{clearTimeout(keepAlive);reject(options.signal.reason);},{once:true});
  });
  if(behavior==='json')return new Response('not-json');
  const answers=Object.fromEntries(fields.map(k=>[k,{noul:behavior==='uncertain'?.5:.01}]));
  if(behavior==='missing')delete answers.seriousHarm;
  if(behavior==='forbidden')answers.sexualMinors.noul=.99;
  return new Response(JSON.stringify({model:p.model,answers}));
};
const input={target:'synthetic',context:[{role:'user',content:'prior context'}],serverMemory:{summary:'prior memory',state:{}}};
const gemini=async()=>{fallbacks++;return {flags};};
(async()=>{
  assert.deepEqual(await classify(input,{adult:false,gemini}),flags);assert.equal(fallbacks,0);
  behavior='forbidden';assert.equal((await classify(input,{adult:true,gemini})).sexualMinors,true);assert.equal(fallbacks,0);
  for(behavior of ['uncertain','http','json','missing','timeout']){
    const before=fallbacks;assert.deepEqual(await classify(input,{adult:false,gemini}),flags);assert.equal(fallbacks,before+1);
  }
  behavior='http';await assert.rejects(classify(input,{adult:false,gemini:async()=>{throw Error('synthetic downstream outage');}}));
  const controller=new AbortController();controller.abort();await assert.rejects(classify(input,{signal:controller.signal,gemini}));
  console.log('PASS hybrid production adapter: context contract, direct safe/prohibited results, ambiguity, HTTP/JSON/missing/2s timeout fallback, downstream failure, cancellation');
})().catch(e=>{console.error(e);process.exitCode=1;});
