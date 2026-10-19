(function(root){
  'use strict';
  function typingDuration(text,random=Math.random){
    const content=String(text||'');
    const characters=Array.from(content.replace(/\s/g,'')).length;
    const pauses=(content.match(/[,.!?。…\n]/g)||[]).length*50;
    // 경쾌하고 빠른 메신저 타속 (글자당 45~65ms, 기본 400ms, 최소 600ms, 최대 10000ms)
    return Math.round(Math.min(10000,Math.max(600,400+characters*(45+random()*20)+pauses)));
  }
  function remainingDelay(text,elapsed=0,random=Math.random){
    const target=typingDuration(text,random);
    // 생성에 이미 소요된 시간(elapsed)을 적극 반영하여 단문/장문 불문 일률적인 멍때림 제거.
    // 긴 메시지라도 생성 완료 후 최대 1800ms를 초과하여 질질 끌지 않도록 상한 제한.
    const minPadding=Math.min(1800,Math.max(300,Math.round(target*0.2)));
    return Math.round(Math.max(minPadding,target-Math.max(0,elapsed)));
  }
  // 첫인사(그리팅)는 대화방 진입 시 준비되는 즉시 바로 노출
  function greetingRemainingDelay(elapsed=0){
    return 0;
  }
  const api={typingDuration,remainingDelay,greetingRemainingDelay};
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.AzitChatTiming=api;
})(typeof window==='object'?window:this);
