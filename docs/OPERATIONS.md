# 아지트챗 운영 관리

- 관리자: https://azitchat.com/admin
- 고객센터: https://azitchat.com/support
- 개인정보·분석 안내: https://azitchat.com/privacy
- GA4: https://analytics.google.com/analytics/web/#/a387739930p559435429/reports/intelligenthome
- 속성: 아지트챗 (azitchat.com), ID 559435429
- 웹 스트림: 아지트챗 웹, ID 16152740855, 측정 ID G-65RXD1Y184

## 로그인

운영자가 정한 공용 비밀번호로 로그인한다. 원문은 코드/Git에 보관하지 않는다. 서버의 `/etc/seollem-ai-lounge/app.env`에 `ADMIN_PASSWORD_HASH`를 `salt:scrypt-hash` 형식으로 보관한다. 비어 있으면 관리 API에 로그인할 수 없다. scrypt는 16바이트 랜덤 salt를 hex 문자열로 변환한 후 그 문자열을 salt로 사용하며 N=16384, r=8, p=1, 결과 64바이트이다.

로그인 실패는 IP별 15분에 5회까지 허용한다. 관리자 세션은 1시간이며 HttpOnly/Secure/SameSite=Strict 쿠키를 사용한다. 비밀번호 해시가 바뀌면 이전 세션도 거부한다. 변경 API는 허용 Origin과 전용 헤더를 확인한다. 공용 관리자 작업은 operator로 기록한다.

## 기능

- 서버 데이터 기반 현재 계정·인증 회원·하트 총합, 7/30/90일 신규 계정·활동 계정·대화·하트 사용 추이.
- 고객 ID/번호 검색, 잔액·하트 원장·대화방/메시지 개수, 내부 고객 메모. 고객 대화 원문은 관리 화면에 노출하지 않는다.
- 문의 접수/처리 중/답변 완료/종료, 공개 답변과 비공개 내부 메모. 고객은 같은 번호로 로그인해 문의와 답변을 확인한다. 답변 문자는 자동 발송하지 않는다.
- 하트 보정은 사유와 확인이 필요하며 0.1 단위, 1회 ±10,000개까지 허용한다. 요청 ID에 고유 제약을 적용해 재전송에도 한 번만 처리하며 원장과 감사 기록을 한 트랜잭션으로 저장한다. 실제 PG 환불 기능과는 별개다.
- 관리자 로그인/조회/메모/보정/문의 처리/분석 설정의 감사 기록.
- 실결제는 계속 비활성 상태이며 매출을 가상으로 집계하지 않는다.

## 데이터·백업

기존 SQLite 파일에 support_tickets, support_messages, admin_audit, app_settings, activity_events 테이블을 추가한다. 기존 사용자·잔액·대화 테이블은 유지한다. 기존 SQLite 백업에 새 테이블도 함께 포함된다. 신규 인증·문의 이벤트는 이 기능 배포 이후부터 기록한다. 계정 수는 현재 존재하는 계정 기준이며 과거 삭제/병합된 게스트를 별도 신규 회원으로 세지 않는다. 활동은 기간 내 하트가 차감된 대화·재연결 기준이다. 직원 테스트 데이터도 실제 DB 지표에 포함될 수 있다.

## GA4

관리자 방문 분석 메뉴에서 측정 ID 및 속성 ID를 설정할 수 있다. 측정 ID를 빈 값으로 저장하면 분석 수집을 비활성화한다. DB 설정이 없으면 환경 변수 `GA_MEASUREMENT_ID`, `GA_PROPERTY_ID`를 사용한다. 측정 ID는 공개 식별자이며 비밀키가 아니다. 보고서는 GA4로 연결하고 어드민 자체 지표는 운영 DB에서 집계한다. GA4 Data API/OAuth 권한을 추가하지 않는다.

방문자가 선택 분석에 동의한 경우에만 공개 서비스 화면에서 Google 태그를 로드한다. DNT=1이면 태그를 로드하지 않는다. 기본 자동 페이지뷰를 끄고 고정된 URL·제목으로 직접 전송한다. 외부 referrer는 origin만 보내며 query/hash는 보내지 않는다. 관리자/고객센터/개인정보 페이지에는 GA 태그를 로드하지 않는다. GA4 스트림의 향상된 측정은 비활성 상태로 만들었다.

허용 이벤트: page_view, chat_message_sent, match_started, phone_verified, phone_login, gift_sent, open_charge, support_created. support_created는 고객센터에서 접수 후 공개 서비스로 돌아올 때 전송한다. 구매/매출 이벤트는 보내지 않는다. 전화번호·고객 ID·대화·문의 원문을 이벤트 매개변수로 사용하지 않는다. Google Signals와 광고 개인 최적화는 끈다. 방문 분석 설정에서 거부로 바꾸면 이후 수집을 중단한다.

일반 GA 보고서 반영에는 시간이 걸릴 수 있다. 실시간 보고서로 수집을 확인하고, 실제 잔액/회원/문의 지표는 어드민을 기준으로 본다.

## 검증

`node ops/oci/smoke.cjs`, `node server/tests/accounts.cjs`, `node server/tests/operations.cjs`, `node server/tests/analytics.cjs`.
관리자 권한/만료/시도 제한/CSRF, 고객 간 문의 격리, 내부 메모 비공개, 잔액 보정 중복 방지/음수 방지/원장/감사 기록, 재시작 복원, 분석 동의·DNT·URL 비식별 처리를 검증한다. 자동 테스트는 분리된 SQLite와 합성 계정을 사용한다.

## 운영 확인 — 2026-10-18

OCI 배포 후 지정 비밀번호 로그인 및 실제 운영 지표 표시, 비로그인 관리 API 401, 고객센터의 번호 인증 화면을 확인했다. GA4 실시간 보고서에서 활성 사용자 1명과 page_view/first_visit/session_start 수신을 확인했다. 실제 고객 문의·하트 보정은 운영 DB에 테스트 데이터를 넣지 않고 분리된 환경에서 검증했다. 실제 문자 수신 확인은 사용자가 사이트에서 진행한다.

## 하트 부족·번호 연동 안내

새 상대 매칭은 화면과 서버 모두 대화 1회 비용(현재 3.7하트)을 기준으로 확인한다. 기존 무제한 이용 권한이 있는 계정은 예외다. 잔액이 부족한 경우 기존 대화방·매칭 이력·매칭 대기시간을 변경하지 않고 안내를 표시한다. 단순히 0하트인지가 아니라 1회 대화가 가능한지 확인한다. `GET /api/match/eligibility`는 최신 잔액을 제공하고 `POST /api/match/request`에서도 다시 검사한다. 따라서 다른 탭에서 잔액을 소진해도 거부된다. 매칭 자체에는 하트를 차감하지 않는다.

미연동 고객은 첫 번호 인증 100하트 혜택 및 번호 연동 전 결제 불가 안내를 보고 인증으로 이동한다. 충전 화면의 결제 수단은 번호 인증 전에는 비활성화하며 주요 버튼은 번호 연동으로 연결한다. 서버 결제 준비/검증 요청도 번호 미인증이면 403으로 차단한다. 인증 회원은 충전 안내를 볼 수 있으나 실결제는 PG 연동 전까지 계속 503으로 차단한다. 기존 번호 재로그인에 보너스를 반복 지급하지 않는 규칙은 그대로 유지한다.

`node server/tests/matching.cjs`는 부족 잔액·정확한 임계값·매칭 이력 보존·서버 잔액 재확인·무제한 권한·미인증 결제 차단·실결제 비활성 상태를 검증한다.

## 휴대폰 인증 화면·계정 전환

320px 화면에서는 번호 입력칸과 발송 버튼을 세로 배치하고, 넓은 화면에서는 입력칸이 줄어들 수 있는 두 열로 배치한다. 인증 창은 화면 높이 안에서 스크롤할 수 있다. 320/360/390px에서 발송 버튼 및 입력칸이 가로 경계를 넘지 않는지 확인했다.

이미 휴대폰 인증된 계정은 인증 폼 대신 현재 번호(마스킹)와 계정 전환/로그아웃 동작을 표시한다. 계정 전환 시 기존 상태 저장 후 로그아웃하고 빈 번호 입력 화면을 연다. 서버의 발송·확인 API도 인증된 세션을 409 ALREADY_AUTHENTICATED로 차단하며, 이 거부는 문자 발송/인증 시도 제한보다 먼저 처리하여 불필요한 발송이나 한도 소모를 막는다. 로그아웃 후 새 세션으로 기존 번호에 다시 로그인하는 것은 가능하며 기존 잔액·대화 및 1회 보너스 규칙을 유지한다.

## 하트 유효기간 — 획득일로부터 2년

실제 잔액의 원본은 `heart_grants`의 지급분별 잔여 수량이다. 각 지급분은 획득 시각, 만료 시각, 지급 수량, 남은 수량, 소멸 수량을 0.1하트 정수 단위로 보관하며 기존 원장과 연결한다. 최초 무료 하트, 첫 번호 인증 보너스, 관리자 지급, 추후 결제 지급을 모두 같은 지갑 경로로 처리한다.

한국시간 기준으로 정확히 2년 뒤의 같은 시각에 만료한다. 2월 29일의 2년 뒤는 2월 28일 같은 시각으로 정한다. 차감은 먼저 획득한 지급분부터 처리하며, 새 하트 지급이나 재로그인으로 다른 지급분의 만료일을 바꾸지 않는다. 첫 번호 인증 시 기존 게스트 지급분은 원래 날짜로 이전하고 100하트 보너스만 인증 시점의 새 지급분으로 생성한다. 기존 회원 재로그인에는 추가 게스트 잔액이나 보너스를 지급하지 않는다.

기존 잔액은 원장 지급 이력과 사용 후 잔액을 바탕으로 지급분을 복원한다. 최초 지급은 계정 생성일이 더 오래된 경우 그 날짜를 사용한다. 오래된 가져오기 데이터에서 원장이 불완전한 경우에만 `legacy_balance_reconciliation`으로 차이를 기록하고 계정 생성일을 근거로 처리한다. 원장·날짜를 임의로 오늘로 리셋하지 않는다. 이전이 완료된 계정은 다시 이전하지 않는다.

프로세스 시작 시 및 다음 만료 시각/최대 1분 간격으로 자동 소멸을 처리하며, 모든 계정 조회·사용·보정 전에도 만료 여부를 확인하므로 만료된 하트를 사용할 수 없다. 소멸은 `heart_expired` 원장으로 한 번만 기록하고 잔액·지급분 수량을 같은 트랜잭션으로 변경한다. 앱이 중지된 동안 지난 만료분도 재시작 시 처리한다. 관리자의 잔액 조회와 전체 집계에도 소멸을 반영한다.

충전 화면에는 정책, 다음 소멸 예정일과 수량, 30일 내 소멸 예정 수량이 표시된다. 관리자의 고객 상세에는 최근 100개 지급분의 획득·잔여·만료·소멸 내역이 표시된다. 실결제 자체는 계속 비활성 상태다.

기존 SQLite 백업에는 지급분·지갑 이전 여부·소멸 원장도 포함된다. `node server/tests/heart-expiry.cjs`는 경계 시각·윤년·부분 사용·독립적인 만료일·소멸 원장 중복 방지·이력 이전·번호 전환·미접속 계정 일괄 소멸·재시작 복원을 검증한다.


### 관리자 대화 조회 및 이용 분석
- `/admin`의 인증 회원, 게스트 세션을 분리하고 대화한 계정/사용자 메시지 없음으로 필터링합니다. 게스트는 세션 수이며 실제 사람 수로 해석하지 않습니다.
- 전체 채팅에서 계정, 번호, 캐릭터 이름, 내용 검색 및 100개 단위의 대화 원문 조회를 제공합니다. 관리자 세션 외에는 접근할 수 없고 목록/원문 조회를 감사 기록에 남깁니다. 원문은 감사 로그나 GA로 전송하지 않습니다.
- `conversation_messages`에 기존 보관 메시지를 일회성 이관하고 이후 메시지를 중복 없이 보관합니다. 방 나가기 이후에도 관리 기록은 유지하며, 본인 확인 후 기록 삭제 요청은 운영자가 별도 처리합니다. 배포 전에 이미 삭제되어 남아 있지 않은 메시지는 복구할 수 없습니다.
- 휴대폰 연결 시 게스트 대화 원장도 인증 계정으로 함께 이전합니다. 회원/게스트별 집계 및 사용자 메시지 수, 대화방 깊이, 다른 KST 날짜에 재이용한 방을 제공합니다.
- 주제는 사용자 발화 키워드를 서버 내부에서 분류한 추정이며 다중 분류됩니다. 시나리오는 캐릭터의 설정을 뜻하고 실제 줄거리를 AI가 평가한 결과가 아닙니다. 최근 최대 50,000개 사용자 메시지를 분석하며 제한에 걸리면 화면에 분석 범위를 명시합니다.
- 브라우저는 Web Locks로 여러 탭의 초기 계정 생성 요청을 직렬화하고, 서버는 서명된 HttpOnly/Secure/SameSite=Strict 게스트 복원 쿠키를 `/auth/guest`에서만 사용합니다. 다른 API의 Bearer 인증은 유지합니다. 번호 인증 시 복원 쿠키를 제거하므로 로그아웃 후 인증 계정으로 자동 복원하지 않습니다. 다른 브라우저·비공개 창·쿠키 전체 삭제는 별도 게스트로 취급하고 IP로 임의 합치지 않습니다.


### 짧은 메신저 말투와 입력 속도
- 남녀 캐릭터 공통으로 평소 15~60자 안팎의 짧은 구어체를 우선하고, 설명을 요청한 경우에는 긴 답변을 허용합니다. 소설식 행동·풍경 묘사, 정형적인 감탄과 문단형 답장을 줄입니다.
- 처음 생성할 때부터 짧게 답하도록 지시합니다. 길다는 이유로 다시 생성하거나 텍스트를 글자 수로 잘라내지 않습니다. 기존 16,384토큰 출력 여유와 실제 토큰 한도 중단 감지는 유지합니다.
- `chatTiming.js`를 첫 인사와 답장에 공통 적용합니다. 내용 길이에 따라 약 2.2~30초의 입력 시간을 계산하고, 모델 생성이 오래 걸렸더라도 긴 답변은 최소 절반의 표시 대기 시간을 유지합니다. 다른 방이나 새 턴으로 이동한 뒤에는 이전 답변을 표시하지 않습니다.


### 상대 정보와 호칭
- 사용자 나이·성별·이름·선호 호칭은 캐릭터의 선호 프로필이나 과거 AI 발화에서 추정하지 않습니다. 확인 전에는 호칭을 생략한 존댓말을 기본으로 하고, 모르는 직업·관계·혼인 여부도 단정하지 않도록 지시합니다.
- 서버는 같은 방의 보관된 사용자 발화에서 명시적인 자기 소개와 호칭 요청·거절을 추출해 최근 12개 모델 문맥과 별도로 전달합니다. 연령·성별은 자기 진술이며 본인·성인 인증의 근거로 사용하지 않습니다. 인용·가정 문장은 근거에서 제외하고, 지원하지 않는 표현은 모르는 상태로 유지합니다.
- 나이만 알려진 경우에는 성별이 확인되지 않아 성별 호칭을 자동 허용하지 않습니다. 구체적인 호칭을 직접 요청하면 그 선호를 우선하고, 사용자가 거부한 호칭은 제외합니다. 추출은 서버 내부에서 수행하며 새 분석 API나 외부 서비스로 보내지 않습니다.

## Public commerce and policy pages (2026-10-18)

- `/products`: four public, server-rendered static product descriptions with VAT-inclusive prices, quantities, delivery, two-year validity, purchase eligibility and refund links. No login or JavaScript is needed to review them. `products.json` is the payment API's catalog; smoke checks compare page prices/quantities against it.
- `/terms`, `/refund`, `/privacy`: full service terms, refund policy and revised privacy policy; `.html` aliases also work. Shared local `policy.css` loads no external trackers/fonts. The original privacy notice is retained at `/privacy-20261018-initial`.
- Footer and first-visit dialog link to the pages. Product links `/?package=<id>` open the selected package; payment remains unavailable in production.
- Removed unsupported discount/reference-price/popularity claims, the misleading extra 2,000-heart bonus, and permanent conversation retention promises. Current package quantities/prices are unchanged.
- Refund policy: unused paid orders may be withdrawn within the statutory seven-day period; unused paid balances may also be refunded proportionally without a separate cancellation fee. Free grants are excluded. Expiration of service credits does not itself eliminate statutory refund rights. Refunds are requested through support/email; no automatic PG refund flow is implemented while payments remain disabled.
- Privacy inventory was checked against actual account/SMS/chat/admin/analytics behavior. OCI instance metadata confirms `ap-chuncheon-1`. Google processing is global and provider terms apply; do not claim a fixed processing country or guaranteed no-training status without confirming the actual API billing agreement.
- Follow-up for payment launch: obtain a landline/070 customer service number (PortOne's published requirements exclude mobile numbers), complete PG underwriting and real checkout/webhook/refund verification, implement checkout terms acknowledgment and required identity/overseas-transfer consent as applicable, and publish verified provider/retention details before collecting new payment or identity fields. Do not mark PG approval or adult verification as live based on these pages.

## Compact character dialogue revision (2026-10-18)

The 10–35 character, single-response rule made reactions generic and discarded character motivation. The shared prompt now asks for a brief reaction with a character-specific opinion, playful response or preference, usually 2–3 short sentences (50–100 characters as a loose guide, with natural shorter or slightly longer replies allowed). It discourages adding an explanation, generic comfort and another question after an already complete response. No length-based regeneration, output slicing, token cap reduction or extra heart charge was introduced.

Personality-specific response guidance now distinguishes warm/calm/lively/chic/shy characters. Joining motivation and affinity cues inform reactions without inviting profile recitation. The existing verified-user-facts/address constraints still take precedence, and emotional discomfort overrides banter.

Validation: compared old/new prompts with the production Gemini model using synthetic examples only; rejected two wordier drafts before choosing the final prompt. Reviewed six paired cases and four additional cases outside the examples for everyday banter, emotional responses, conversational continuity and different character styles. Before the user requested more breathing room, paired new responses ranged from 36 to 82 characters. The final revision allows more room for natural continuation; quality remains subjective and individual generations vary. No customer histories were used, production accounts created or balances modified during model review. Address-context and completion regression checks passed; the deployment suite runs before release.
