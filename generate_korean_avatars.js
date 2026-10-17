/**
 * 1,000+ 한국인 여성 및 한국 일상/등산/손/직업 프로필 사진 대량 생성 스크립트
 * 사용법:
 *   $env:GEMINI_API_KEY="AIzaSy..." ; node generate_korean_avatars.js --count=200
 *
 * 주의: API 키는 코드에 하드코딩하지 마시고 환경변수($env:GEMINI_API_KEY)로만 전달하세요.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const API_KEY = process.env.GEMINI_API_KEY || '';
const args = process.argv.slice(2);
const countArg = args.find(a => a.startsWith('--count='));
const TARGET_COUNT = countArg ? parseInt(countArg.split('=')[1], 10) : 100;

if (!API_KEY) {
  console.error('❌ 환경변수 GEMINI_API_KEY가 설정되지 않았습니다.');
  console.error('실행 예시: $env:GEMINI_API_KEY="새로_발급받은_키" ; node generate_korean_avatars.js --count=100');
  process.exit(1);
}

const OUT_DIR = path.join(__dirname, 'avatars', 'batch');
if (!fs.existsSync(OUT_DIR)) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

const PROMPT_TEMPLATES = [
  // 1. 본인 셀카 (20~30대 한국 여성)
  'A realistic smartphone selfie of a {age}-year-old South Korean woman in {place}, natural Korean makeup, {hair}, soft warm smile, shot on iPhone, photorealistic, no text',
  // 2. 남이 찍어준 스냅 (20~30대 한국 여성)
  'A realistic candid smartphone photo of a {age}-year-old South Korean woman sitting across a table at {place}, {hair}, looking warmly at camera, shot by a friend on iPhone, photorealistic',
  // 3. 단정한 프로필 사진 (20~50대 한국 여성)
  'A realistic smartphone portrait of a {age}-year-old South Korean woman wearing casual elegant outfit at {place}, {hair}, gentle smile, natural daylight, photorealistic',
  // 4. 손 찍어서 올린 감성 사진 (얼굴 없음)
  'A realistic first-person POV smartphone photo of a Korean woman hand holding {handItem} in a cozy Korean cafe, natural sunlight, photorealistic, no face',
  // 5. 등산·자연 사진 (한국 산/바다/단풍)
  'A realistic smartphone photo of {natureScene} in South Korea, shot by a hiker on iPhone, natural daylight, photorealistic',
  // 6. 직업·공방 사진
  'A realistic smartphone photo of {jobScene} in a bright Korean studio, shot on iPhone, photorealistic'
];

const AGES = [23, 25, 26, 27, 28, 29, 31, 32, 34, 36, 42, 48, 53];
const PLACES = [
  'a sunlit cafe in Seongsu-dong Seoul',
  'a quiet book cafe in Yeonnam-dong Seoul',
  'an autumn park path in Seoul',
  'Bukchon Hanok Village alley in Seoul',
  'a cozy bakery cafe in Hannam-dong',
  'a riverside walkway by the Han River at sunset',
  'a botanical garden lounge in Gyeonggi-do'
];
const HAIRS = [
  'long dark brown wavy hair',
  'shoulder-length neat black bob hair',
  'soft layered dark brown hair with see-through bangs',
  'low ponytail dark hair',
  'natural straight dark brown hair'
];
const HAND_ITEMS = [
  'a warm ceramic mug of latte art over a wooden table',
  'an iced americano on a sunlit wooden terrace table',
  'a delicate porcelain teacup of green tea',
  'a glass of red wine at a warmly lit dining bar',
  'a small pastel flower bouquet wrapped in kraft paper',
  'petting a cute white Maltese puppy on a living room rug'
];
const NATURE_SCENES = [
  'granite mountain peak ridges of Bukhansan with blue sky',
  'an autumn maple and ginkgo tree forest trail in Seoraksan',
  'golden sunset over the East Sea beach in Gangneung',
  'spring cherry blossom walkway by Seokchon Lake in Seoul',
  'a peaceful mountain valley stream with clear water in Korea'
];
const JOB_SCENES = [
  'freshly baked croissants and strawberry shortcake on a wooden tray',
  'pastel roses and eucalyptus arranged on a florist workbench',
  'handmade Korean white porcelain teacups on a wooden tea table',
  'a grand piano keyboard with sheet music in a sunlit lesson room',
  'watercolor brushes and pastel canvas on a wooden easel'
];

function pick(arr, seed) {
  return arr[seed % arr.length];
}

function buildPrompt(i) {
  const tpl = PROMPT_TEMPLATES[i % PROMPT_TEMPLATES.length];
  return tpl
    .replace('{age}', pick(AGES, i * 3))
    .replace('{place}', pick(PLACES, i * 5))
    .replace('{hair}', pick(HAIRS, i * 7))
    .replace('{handItem}', pick(HAND_ITEMS, i * 11))
    .replace('{natureScene}', pick(NATURE_SCENES, i * 13))
    .replace('{jobScene}', pick(JOB_SCENES, i * 17));
}

function generateOneImage(prompt, outPath) {
  return new Promise((resolve, reject) => {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${encodeURIComponent(API_KEY)}`;
    const body = JSON.stringify({
      instances: [{ prompt }],
      parameters: { sampleCount: 1, aspectRatio: '1:1', outputOptions: { mimeType: 'image/jpeg' } }
    });

    const req = https.request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, (res) => {
      let data = '';
      res.on('data', chunk => (data += chunk));
      res.on('end', () => {
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
        }
        try {
          const json = JSON.parse(data);
          const b64 = json.predictions?.[0]?.bytesBase64Encoded;
          if (!b64) return reject(new Error('No image bytes in response'));
          fs.writeFileSync(outPath, Buffer.from(b64, 'base64'));
          resolve(outPath);
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

(async () => {
  console.log(`🚀 총 ${TARGET_COUNT}장의 한국형 프로필 이미지 생성을 시작합니다...`);
  for (let i = 1; i <= TARGET_COUNT; i++) {
    const fileName = `kr_batch_${String(i).padStart(4, '0')}.jpg`;
    const outPath = path.join(OUT_DIR, fileName);
    if (fs.existsSync(outPath)) continue;
    const prompt = buildPrompt(i);
    try {
      await generateOneImage(prompt, outPath);
      console.log(`✅ [${i}/${TARGET_COUNT}] 생성 완료: ${fileName}`);
      await new Promise(r => setTimeout(r, 1500));
    } catch (err) {
      console.error(`⚠️ [${i}/${TARGET_COUNT}] 실패:`, err.message);
      break;
    }
  }
})();
