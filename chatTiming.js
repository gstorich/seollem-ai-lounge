(function(root){
  'use strict';
  function typingDuration(text,random=Math.random){
    const content=String(text||'');
    const characters=Array.from(content.replace(/\s/g,'')).length;
    const pauses=(content.match(/[,.!?。…\n]/g)||[]).length*100;
    return Math.round(Math.min(30000,Math.max(2200,900+characters*(110+random()*30)+pauses)));
  }
  function remainingDelay(text,elapsed=0,random=Math.random){
    const target=typingDuration(text,random);
    // Generation overlaps typing, but a long message must never flash in instantly.
    return Math.round(Math.max(2000,target*0.5,target-Math.max(0,elapsed)));
  }
  // First contact should arrive promptly. Provider time already counts toward
  // the small connection beat; never add length-based typing after generation.
  function greetingRemainingDelay(elapsed=0){
    return Math.max(0,600-Math.max(0,elapsed));
  }
  const api={typingDuration,remainingDelay,greetingRemainingDelay};
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.AzitChatTiming=api;
})(typeof window==='object'?window:this);
