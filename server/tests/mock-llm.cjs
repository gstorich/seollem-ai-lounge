// Provider simulation is loaded only by isolated test child processes.
const assert=require('node:assert/strict');
const original=global.fetch,counts=new Map();
global.fetch=async(url,options)=>{
  if(!String(url).startsWith('https://generativelanguage.googleapis.com/'))return original(url,options);
  const p=JSON.parse(options.body),text=p.contents.at(-1).parts[0].text;
  const count=(counts.get(text)||0)+1;counts.set(text,count);
  assert.equal(p.generationConfig.maxOutputTokens,16384);
  if(text.includes('network-test'))throw Error('Synthetic network failure');
  if(text.includes('http-test')||(text.includes('http-once')&&count===1))return new Response('{}',{status:502});
  if(text.includes('slow-test'))await new Promise(r=>setTimeout(r,90));
  if(text.includes('address-test')){
    const prompt=p.systemInstruction.parts[0].text;
    assert(prompt.includes('"age":45'));assert(prompt.includes('"gender":"female"'));
    assert(prompt.includes(text.includes('부르지')?'"allowedAddressTerms":[]':'"allowedAddressTerms":["누나"]'));
  }
  const finish=text.includes('limit-test')||(text.includes('completion-retry')&&count===1)?'MAX_TOKENS':text.includes('blocked-test')?'SAFETY':'STOP';
  const answer=text.includes('자세하게')?'차근차근 이야기해볼게요 '.repeat(20):'오늘 이야기 즐거웠어요. 다음에도 편하게 이야기해요.';
  return new Response(JSON.stringify({candidates:[{finishReason:finish,content:{parts:text.includes('empty-test')?[]:[{thought:true,text:'private internal reasoning'},{text:finish==='STOP'?answer:'incomplete fragment'}]}}]}));
};
