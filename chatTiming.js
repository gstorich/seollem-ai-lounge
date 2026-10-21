(function(root){
  'use strict';
  function typingDuration(text,random=Math.random){
    const content=String(text||'').trim();
    const characters=Array.from(content.replace(/\s/g,'')).length;
    const pauses=(content.match(/[,.!?。…\n]/g)||[]).length*50;
    // 말짧은 간결형("ㅎㅇ", "안녕", "뭐해", "ㅇㅇ" 등 3자 이하 초단문)은 초고속 메신저 타속 (180~350ms)
    if (characters <= 3) {
      const base = 160 + characters * 35 + (random() * 50);
      return Math.round(Math.min(350, Math.max(180, base)));
    }
    // 일반 문장 (글자당 45~65ms, 기본 400ms, 최소 600ms, 최대 10000ms)
    return Math.round(Math.min(10000,Math.max(600,400+characters*(45+random()*20)+pauses)));
  }
  function remainingDelay(text,elapsed=0,random=Math.random){
    const target=typingDuration(text,random);
    const content=String(text||'').trim();
    const characters=Array.from(content.replace(/\s/g,'')).length;
    // 3자 이하 초단문은 최소 대기 패딩 120ms로 번개같이 툭 발송
    const minPadding = characters <= 3
      ? 120
      : Math.min(1800,Math.max(300,Math.round(target*0.2)));
    return Math.round(Math.max(minPadding,target-Math.max(0,elapsed)));
  }
  // 첫인사(그리팅)는 대화방 진입 시 준비되는 즉시 바로 노출
  function greetingRemainingDelay(elapsed=0){
    return 0;
  }
  // 연속되는 두 번째 이후 말풍선의 자연스러운 카톡식 호흡 (사람이 다음 문장을 입력하는 400~800ms 템포)
  function subsequentBubbleDelay(text,random=Math.random){
    const content=String(text||'').trim();
    const characters=Array.from(content.replace(/\s/g,'')).length;
    return Math.round(Math.min(800,Math.max(380,360+characters*(12+random()*10))));
  }
  // 실제 카카오톡처럼 1~3개의 자연스럽고 온전한 말풍선 호흡으로 분할 (상황에 따라 1개, 2개, 3개 가변)
  function splitIntoRealisticBubbles(text, options = {}) {
    const raw = String(text || '').trim();
    if (!raw) return [];
    // 20자 이하의 단문이나 단일 호흡은 쪼개지 않고 1개로 깔끔하게 전송
    if (raw.length <= 20) return [raw];

    // 1. 줄바꿈 분할 (최대 3개까지 자연스러운 호흡으로 허용)
    if (raw.includes('\n')) {
      const lines = raw.split(/\r?\n+/).map(s => s.trim()).filter(Boolean);
      if (lines.length > 1) {
        const result = [];
        for (const line of lines) {
          if (result.length > 0 && (result[result.length - 1].length < 8 || line.length < 4)) {
            result[result.length - 1] += ' ' + line;
          } else if (result.length >= 3) {
            result[result.length - 1] += ' ' + line;
          } else {
            result.push(line);
          }
        }
        if (result.length > 1) {
          return result;
        }
      }
    }

    // 2. 명확한 종결 구두점(. ! ?) 뒤 공백 기준 분할 (상황에 따라 1~3개)
    // 말줄임표(...) 중간이나 감탄사 직후는 호흡이므로 자르지 않고, 온전한 단일 구두점 뒤에서만 분할
    const punctSplits = raw.split(/(?<=(?<!\.)[.!?~](?!\.))\s+/).map(s => s.trim()).filter(Boolean);
    if (punctSplits.length >= 2) {
      const result = [];
      for (const piece of punctSplits) {
        if (result.length === 0) {
          result.push(piece);
        } else if (result.length < 3 && result[result.length - 1].length >= 8 && piece.length >= 5) {
          result.push(piece);
        } else {
          result[result.length - 1] += ' ' + piece;
        }
      }
      if (result.length > 1) return result;
    }

    // 3. 구두점 없이 어절 단위로 긴 문장 (28자 이상)
    if (raw.length >= 28) {
      const endMatch = raw.match(/^(.{10,38}?(?:았어|었어|였어|겠어|했어|했네|하네|없네|있네|없어|있어|잖아|거든|이야|보자|하자|줄게|할게|갈게|올게|맞아|아냐|같아|끝내자|알았어|좋아|돼))\s+(.{6,})$/);
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
