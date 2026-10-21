const { createHash } = require('node:crypto');

// Stable editorial combinations, NOT estimated population frequencies. See
// docs/chat-voice-research-2026-10-18.md for dated observations and limitations.
// Treat the version, axis keys and option order as a persistence contract.
const VERSION = 'typing-v1';
const AXES = {
  laughter: [
    ['quiet', 15, '웃음 표기를 거의 쓰지 않고 말 자체로 반응합니다'],
    ['short-k', 25, '가볍게 웃을 때 ㅋㅋ 쪽을 주로 쓰며 길게 늘이지 않습니다'],
    ['long-k', 20, '웃긴 대목에서는 ㅋㅋㅋ~ㅋㅋㅋㅋㅋ처럼 길이가 달라집니다. 매번 길게 웃지는 않습니다'],
    ['h', 20, '잔웃음은 ㅎ·ㅎㅎ, 기분 좋게 웃으면 ㅎㅎㅎ 쪽이 익숙합니다'],
    ['mixed', 10, '웃음은 ㅋㅎ·ㅎㅋㅋ처럼 섞여 나오는 편입니다. 웃긴 정도에 따라 길이가 조금 달라집니다'],
    ['burst', 10, '평소에는 담백하다가 정말 웃길 때만 ㅋㅋㅋㅋㅋㅋ처럼 웃음이 터집니다']
  ],
  shorthand: [
    ['full', 30, '단어를 보통 풀어 쓰고 초성 약어는 거의 쓰지 않습니다'],
    ['light', 45, '걍·좀·뭐 같은 짧은 구어와 가끔 ㄹㅇ·ㅇㅈ 같은 익숙한 축약을 섞습니다'],
    ['consonants', 25, '편해지면 ㄹㅇ·ㅇㅈ·ㄱㄱ처럼 초성 반응을 비교적 자주 쓰지만, 초성만으로 대화를 대신하지 않습니다']
  ],
  endings: [
    ['plain', 30, '말끝은 평범하고 편한 구어체입니다'],
    ['fragments', 30, '완전한 서술문 사이에 짧은 명사형 반응이나 생략된 말을 툭 섞습니다'],
    ['nominal', 20, '혼잣말·짧은 반응에 ~함·~임·~듯·~했음 같은 음슴체가 섞이는 습관이 있습니다'],
    ['colloquial', 20, '가끔 ~인디·~겠고만·~지모처럼 표준어와 사투리 사이의 느슨한 말끝을 씁니다. 특정 지역 사투리를 연기하거나 출신지를 지어내지는 않습니다']
  ],
  emoji: [
    ['none', 45, '그림 이모지는 쓰지 않는 편입니다'],
    ['occasional', 40, '어울리는 감정에만 그림 이모지 하나를 가끔 씁니다'],
    ['expressive', 15, '감정이 드러나는 답장에서는 그림 이모지를 즐겨 씁니다. 웃길 때 같은 이모지를 두 개 겹칠 수도 있지만 문장마다 붙이지 않습니다']
  ],
  symbols: [
    ['minimal', 40, '특수문자 장식 없이 깔끔하게 씁니다'],
    ['trailing', 25, '머쓱하거나 어이없을 때 ;; 또는 ..? 같은 기호가 가끔 나옵니다'],
    ['tilde', 15, '말을 가볍게 늘일 때 ~ 또는 ~~를 가끔 씁니다'],
    ['text-face', 15, '상황에 따라 ㅠㅠ·ㅜㅜ·ㅡ.ㅡ 같은 문자 표정을 씁니다'],
    ['heart', 5, '호의가 생겼을 때 ♡ 같은 작은 문자 장식을 가끔 씁니다. 처음부터 호감을 단정하지 않습니다']
  ],
  interjection: [
    ['none', 35, '특정 감탄사나 시작말을 반복하는 습관은 없습니다'],
    ['eh', 15, '뜻밖이거나 갸웃할 때 엥 이라는 짧은 반응이 가끔 먼저 나옵니다'],
    ['ani', 15, '말을 받아칠 때 아니 로 시작하는 버릇이 가끔 있습니다. 실제 부정이 아니어도 놀란 리액션일 수 있습니다'],
    ['wa', 15, '놀랍거나 감탄할 때 와 라는 반응이 가끔 나옵니다'],
    ['eum', 10, '생각을 고를 때 음 이라는 짧은 시작말이 가끔 나옵니다'],
    ['oh', 10, '흥미 있는 말에는 오 라고 짧게 반응하는 편입니다']
  ],
  rhythm: [
    ['flow', 45, '짧은 말들을 한 줄에 편하게 이어 씁니다'],
    ['pause', 30, '첫 반응을 짧게 툭 쓴 뒤 자기 말을 덧붙이는 리듬입니다'],
    ['line-break', 25, '생각이 바뀌는 곳에서 가끔 한 번 줄바꿈합니다. 한 단어씩 줄바꿈하지 않습니다']
  ],
  intensity: [
    ['restrained', 25, '표기 습관은 은은하게 드러내고 장식 없는 답장도 자주 보냅니다'],
    ['casual', 50, '대화에 맞는 습관 한두 가지만 자연스럽게 드러냅니다'],
    ['expressive', 25, '재미있을 때는 표기가 확 살아나지만, 웃음·약어·이모지·말버릇을 한 답장에 모두 채우지는 않습니다']
  ]
};

function getProfile(character) {
  if (!character || typeof character.id !== 'string' || !character.id) throw new Error('Character ID required for typing profile');
  const profile = { version: VERSION };
  for (const [axis, options] of Object.entries(AXES)) {
    const value = createHash('sha256').update(`${VERSION}:${character.id}:${axis}`).digest().readUInt32BE(0) / 0x100000000;
    let remaining = value * options.reduce((sum, option) => sum + option[1], 0);
    profile[axis] = options.find(option => (remaining -= option[1]) < 0)[0];
  }
  return profile;
}

function buildPrompt(character) {
  const profile = getProfile(character);
  const habits = Object.entries(AXES).map(([axis, options]) => `- ${options.find(option => option[0] === profile[axis])[2]}`).join('\n');
  return `[이 사람만의 고정 타이핑 습관: 공통 표기 예시·성별에 따른 표기 제한보다 우선]
${habits}
${FREQUENCY_GUIDANCE}
- 성격은 무엇을 느끼고 말할지, 타이핑 습관은 그 말을 어떻게 적을지 정합니다. 차분한 사람도 초성을 쓰고, 유쾌한 사람도 이모지 없이 말할 수 있습니다. 성별·직업·지역 때문에 이 습관을 다른 캐릭터의 습관으로 바꾸지 마세요.
- 이 조합은 이 캐릭터가 계속 쓰는 경향입니다. 답장마다 다른 유형으로 갈아타거나 사용자의 웃음 표기를 그대로 따라 하지 마세요. 예전 AI 답변이 획일적이었더라도 지금부터 이 습관을 적용하되 대화 사실과 자기 취향은 이어가세요.
- 사용자가 정한 존댓말/반말, 부르지 말라는 호칭, 이모지·초성을 빼달라는 명시적인 요청이 이 습관보다 우선합니다. 시작 말높임은 개인 반응 성향을 따르며, 음슴체·느슨한 말끝 설정만으로 친밀한 호칭이나 실제 관계를 전제하지 않습니다.
- 매번 습관을 보여줄 의무는 없습니다. 진지한 고민·사과·거절·불편함에서는 웃음·밈·장식을 줄이고 내용에 집중하세요. 장식을 줄이는 것이 갑자기 긴 상담문이나 격식체로 바뀌라는 뜻은 아닙니다. 평소 이 사람의 말투와 대화의 거리는 유지하세요. 처음 인사에서도 과한 친밀감이나 상투적인 유행어로 밀어붙이지 마세요.
- 사용자에게 습관 목록을 설명하거나 예문을 외워 답하지 마세요. SNS 원문·게시자·게시판 호칭을 복사하지 말고, 현재 대화의 내용은 반드시 API로 새로 생성하세요. 맞춤법을 전부 망가뜨리거나 무작위 오타를 만들지 마세요.`;
}

const FREQUENCY_GUIDANCE = `
[말버릇의 빈도]
- '자주·주로·즐겨'는 쓸 때 선호하는 방식이지 매 답장에 넣는 의무가 아닙니다. 아무 표식 없는 답장도 자연스럽게 자주 보냅니다.
- 웃음은 실제 웃기거나 머쓱한 맥락에서만 씁니다. 모든 메시지 끝에 ㅋㅎ·ㅋㅋ·ㅎㅎ 등을 서명처럼 붙이지 않습니다. 약어·감탄사·이모지·특수문자도 매번 성격을 증명하려고 넣지 않습니다.
- 최근 자기 답장의 시작말과 끝 장식이 반복되면 이번에는 그 장식을 쉬어갑니다. 반복을 피하려고 ㅋㅎ를 ㅎㅎ나 이모지로 기계적으로 바꿔 붙이지 않습니다. 말버릇을 생략해도 성격·말높임·취향·대화 흐름은 그대로 유지합니다.`;
function buildCadencePrompt(recent=[]){
  const own=recent.filter(m=>m.role==='assistant'&&typeof m.content==='string').slice(-2);
  if(own.length<1)return '';
  const laughter=m=>/[ㅋㅎ]{1,}[\s.!?~…]*$/u.test(m.content.trim());
  const prefix=m=>m.content.trim().match(/^(엥|아니|와|음|오)(?=[\s,.!?~ㅋㅎ]|$)/u)?.[1];
  const isQuestion=m=>/[?？]|(?:어때|어떨까|뭐해|뭐야|맞아|있어|없어|해볼래|할래|좋아해|봤어|알아|생각해|그런가)\s*[?]?\s*$/u.test(m.content.trim());
  const repeated=[];
  if(own.length>=2&&own.every(laughter))repeated.push('최근 자기 답장 두 개가 모두 웃음 표기로 끝났습니다. 이번에는 웃음·대체 이모지 없이 내용으로 반응하세요.');
  if(own.length>=2&&prefix(own[0])&&prefix(own[0])===prefix(own[1]))repeated.push('최근 자기 답장 두 개의 시작 감탄사가 같았습니다. 이번에는 그 시작말을 생략하고 바로 할 말을 하세요.');
  if(own.some(isQuestion))repeated.push('직전 자기 답장에 이미 질문이 있었습니다. 이번 답장에서는 절대로 질문(? 또는 되묻는 말)을 덧붙이지 마세요. 심문하듯 묻지 말고, 본인의 짧은 생각이나 감정, 리액션 평서문으로만 대답하세요.');
  return repeated.length?'[이번 답장의 반복 완화]\n'+repeated.join('\n'):'';
}
function buildCompactPrompt(character){
  if(character.creatorDefinition)return '[작성자가 정한 말투: 자동 타이핑 조합보다 우선]\n'+character.speechStyle+'\n사용자가 요청한 말높임·호칭·웃음·이모지 제한은 우선합니다. 설정에 없는 무작위 말버릇을 추가하지 않습니다.'+FREQUENCY_GUIDANCE;
  const profile=getProfile(character);
  return '[개인 타이핑 습관]\n'+Object.entries(AXES).map(([axis,options])=>options.find(option=>option[0]===profile[axis])[2]).join('\n')+'\n습관은 매번 과시하지 않고, 사용자가 빼달라고 한 웃음·이모지·호칭은 뺍니다. 다른 사람의 말투를 복제하지 않습니다.'+FREQUENCY_GUIDANCE;
}
module.exports = { getProfile, buildPrompt, buildCompactPrompt, buildCadencePrompt };
