# 이니시스 성인인증 및 카드 결제 개통

2026-10-21: 기존 가맹점의 통합인증과 카드결제 상점ID 추가 신청은 접수대기. 신청만으로 운영 결제나 인증을 활성화하지 않는다.

## 운영 설정

서버 환경파일에서 다음 값을 설정한다. 비밀키를 프런트엔드, Git, 로그, 채팅에 넣지 않는다.

- `PORTONE_MODE=live`
- `PORTONE_APPROVED_ORIGIN=https://azitchat.com` (해당 서비스 도메인 승인 확인 후)
- `PORTONE_PAYMENT_PROVIDER=inicis`
- `PORTONE_IDENTITY_PROVIDER=INICIS_UNIFIED`
- `PORTONE_STORE_ID`: 아지트챗 상점의 포트원 V2 store ID
- `PORTONE_V2_API_SECRET`: 해당 상점 조회/취소 권한의 V2 비밀키
- `PORTONE_PAYMENT_CHANNEL_KEY`: 승인된 INICIS_V2 카드 채널
- `PORTONE_INICIS_MID`: 아지트챗 카드결제용 추가 발급 MID (기존 타 서비스 MID 사용 금지)
- `PORTONE_IDENTITY_CHANNEL_KEY`: 승인된 INICIS_UNIFIED 채널
- `PORTONE_IDENTITY_MID`: 포트원 연동용 MII 형식 통합인증 MID
- `PORTONE_PAYMENT_ENABLED=false`, `PORTONE_IDENTITY_ENABLED=false`: 개별 개통·검수 완료 후 각각 true

필수 값, 승인 도메인, live 모드가 충족되지 않으면 운영 기능은 닫힌다. 테스트 환경 결과로 운영 성인 접근 권한을 만들 수 없다.

## 화면 및 검증

- `/billing`: 번호 연결 안내, 상품/금액/유효기간/환불 확인, 이니시스 카드 결제, 성인인증, 주문 결과 재조회 및 조건부 전액 환불.
- `/payment/complete`: PC SDK 반환 및 모바일 redirect 후 같은 계정에서 서버 재조회. URL의 결제 성공 표시는 신뢰하지 않는다.
- `/verification/complete`: 본인확인 번호를 해당 계정의 서버 발급 요청과 대조하고 기관 결과를 조회한다.
- 간편인증은 SDK bypass `inicisUnified.flgFixedUser=N`, `FRGNDInfo=N`. 이름/생년월일은 자체 입력받지 않고 기관 화면에서 처리한다. 기관 응답의 전화번호가 로그인 계정과 다르면 거절한다.
- CI/DI/실명/생년월일 원문은 DB 저장하지 않는다. 요청시 번호와 기관 결과로 검증한 번호/연령 여부/시각/요청ID/방법/모드만 유지한다. 성인인증은 하트를 차감하지 않는다.
- 일반 대화와 성인 제한 기능의 접근은 구분한다. 만 19세 미만 또는 인증 미완료자는 성인 제한 기능 차단. 테스트 인증 결과는 운영 성인 권한으로 인정하지 않는다.
- 카드 결과는 V2 GET payments로 상점, 채널, PG, MID, LIVE/TEST, V2, 주문번호, 상품명, 금액, KRW, 카드수단, 사용자 지정 nonce를 검증한다. 기존 원자적 heart ledger와 영수증 고유 제약으로 중복 지급을 막는다.
- V2 웹훅: `https://azitchat.com/api/payment/webhook`. 본문의 data.paymentId는 재조회 트리거일 뿐이다. 서명 없는 요청도 공급자 GET 검증 없이 상태를 바꾸지 않는다. 알 수 없는 주문은 지급하지 않는다. 재조회 작업도 유지한다.
- 환불은 구매일로부터 7일 이내 해당 유료 구매분 전량 미사용 시 전체 취소. V2 cancel에 amount와 currentCancellableAmount 전달. 결과가 불명확하면 내구성 있는 하트 보류를 유지하고 자동으로 돈 이동을 재시도하지 않는다. 운영자가 PG 결과를 확인한 뒤 조치한다.
- 과거 V1 다날 주문은 apiVersion 없음/1로 기존 조회·환불 어댑터 유지. 새 주문은 V2. V1 예전 자격증명은 필요한 과거 주문 처리 기간에만 보관한다.

## 승인 후 실 검수

1. 계약 요금과 업종 허용 범위, 승인 도메인, 카드 MID 및 인증 MID, 실제 제공 인증서를 확인한다.
2. 테스트 환경에서 PC/모바일 인증 성공·실패·취소·번호 불일치·미성년 결과와 결제·재조회·중복 웹훅·취소를 확인한다.
3. 방침의 예정 업체·처리 항목/보관 기준과 실제 계약·운영 일자를 맞추고 필요한 고지·동의를 반영한다. CI 별도 제공 요청은 별도 검토한다.
4. 운영 키와 채널을 설정한 뒤 승인된 소액 결제·취소와 실명 인증을 사용자가 직접 검수한다. 인증/결제/환불에는 실제 비용이 발생할 수 있다.
5. 기능별 enabled를 켜고 개통을 확인한다. 이 구현 단계에서는 실제 결제·취소 및 유료 본인인증을 실행하지 않는다.

공식 문서: https://developers.portone.io/opi/ko/integration/pg/v2/inicis-v2 및 https://developers.portone.io/opi/ko/integration/pg/v2/inicis-unified-identity-verification
API 필드 확인: @portone/server-sdk 0.19.0 공식 타입(SelectedChannel, PaidPayment, PaymentAmount, CancelPaymentBody, IdentityVerificationVerifiedCustomer). SDK 의존성을 추가 설치하지 않고 REST를 사용한다.
