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
  // 연속되는 두 번째 이후 말풍선의 자연스러운 카톡식 호흡 (이미 발화 중이므로 350~750ms의 경쾌한 타속)
  function subsequentBubbleDelay(text,random=Math.random){
    const content=String(text||'');
    const characters=Array.from(content.replace(/\s/g,'')).length;
    return Math.round(Math.min(800,Math.max(350,300+characters*(10+random()*8))));
  }
  // 실제 카카오톡처럼 1~3개의 자연스러운 말풍선 호흡으로 분할
  function splitIntoRealisticBubbles(text, options = {}) {
    const raw = String(text || '').trim();
    if (!raw) return [];
    if (raw.length <= 22) return [raw];

    // 1. 줄바꿈 분할
    if (raw.includes('\n')) {
      const lines = raw.split(/\r?\n+/).map(s => s.trim()).filter(Boolean);
      if (lines.length > 1) {
        const result = [];
        for (const line of lines) {
          if (result.length > 0 && (result[result.length - 1].length < 7 || line.length < 4) && result.length < 3) {
            result[result.length - 1] += ' ' + line;
          } else {
            result.push(line);
          }
        }
        if (result.length > 1) return result.slice(0, 3);
      }
    }

    // 2. 구두점(. ! ? ~) 뒤 공백 기준 분할
    const punctSplits = raw.split(/(?<=[.!?~])\s+/).map(s => s.trim()).filter(Boolean);
    if (punctSplits.length >= 2) {
      const result = [];
      for (const piece of punctSplits) {
        if (result.length === 0) {
          result.push(piece);
        } else if (result.length < 3 && result[result.length - 1].length >= 7 && piece.length >= 4) {
          result.push(piece);
        } else {
          result[result.length - 1] += ' ' + piece;
        }
      }
      if (result.length > 1) return result.slice(0, 3);
    }

    // 3. 구두점 없이 어절 단위로 긴 문장 (28자 이상)
    if (raw.length >= 28) {
      const endMatch = raw.match(/^(.{8,38}?(?:았어|었어|였어|겠어|했어|했네|하네|없네|있네|없어|있어|잖아|거든|이야|보자|하자|줄게|할게|갈게|올게|맞아|아냐|같아|끝내자|알았어))\s+(.{6,})$/);
      if (endMatch) {
        return [endMatch[1].trim(), endMatch[2].trim()];
      }
    }

    return [raw];
  }
  const api={typingDuration,remainingDelay,greetingRemainingDelay,subsequentBubbleDelay,splitIntoRealisticBubbles};
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.AzitChatTiming=api;
})(typeof window==='object'?window:this);
