> **현재 공유 OCI 서버 배포:** 실제 배포 구성과 명령은 [ops/oci/README.md](../ops/oci/README.md)를 따르세요. 기존 서버는 Nginx + systemd를 사용하며 4000번 포트를 이미 다른 서비스가 사용합니다. 아래 Docker 절차는 별도 신규 서버용 참고 자료입니다. SMS·결제 및 과금 보안은 아직 완성되지 않았습니다.

# 🏛️ 아지트챗 - OCI(Oracle Cloud Infrastructure) 백엔드 아키텍처 및 배포 가이드

본 문서는 프론트엔드에 노출되면 심각한 보안 취약점(LLM API Key 탈취, 프롬프트 인젝션, 하트/결제 위변조)이 발생하는 핵심 로직들을 **서버 사이드(OCI 백엔드)**로 완전히 격리하고 배포하기 위한 아키텍처 명세서입니다.

---

## 1. 아키텍처 분리 및 보안 구조 (Architecture Overview)

```
[사용자 브라우저 (Frontend)]
       │
       ▼ (HTTPS / TLS 1.3 - 포트 443)
[OCI Load Balancer / Nginx Reverse Proxy]
       │
       ▼ (내부망 포트 4000)
[AzitChat Backend Container (Node.js / Express)]
   ├── 🛡️ JWT Session Guard (인증/세션 토큰 검증)
   ├── 💰 Economy & Heart Engine (하트 차감, 결제 무결성 검증)
   ├── 🎭 Confidential Persona Engine (시스템 프롬프트 & 비밀 사진첩 보호)
   └── 🤖 AI Proxy Service (Gemini / OpenAI API Key 은닉 호출)
       │
       ▼ (외부 보안 통신)
[Google Gemini API / OpenAI API / 결제사 Webhook]
```

### 왜 프론트엔드 단독 구동을 배제해야 하는가? (보안 위험 요인)
1. **AI API 키 노출 방지**: Gemini/OpenAI API 키가 클라이언트에 들어가면 개발자 도구(`F12`)를 통해 1초 만에 유출되어 대규모 비용 피해 발생.
2. **프롬프트 및 캐릭터 비즈니스 로직 은닉**: 상대방의 말투, 성향, 호감도 규칙, 비밀 사진첩 메타데이터는 서버에서만 해석되어야 역공학을 방지할 수 있음.
3. **하트 및 과금 무결성 보장**: `state.hearts` 수치를 클라이언트가 임의로 수정하여 무료로 사용하는 어뷰징 원천 차단. 메시지 전송 및 사진 열람 시 서버 DB 트랜잭션으로 차감.
4. **휴대폰 인증 및 세션 검증**: SMS 인증번호(OTP) 검증 및 계정 데이터 바인딩을 서버 JWT 세션으로 통제.

---

## 2. 백엔드 디렉터리 구성 (`server/`)

```
server/
├── config/              # 환경변수 로더 (.env, 포트, 허용 오리진)
├── middleware/          # JWT 인증 미들웨어 (requireAuth)
├── routes/
│   ├── auth.js          # 게스트 세션 발급, SMS OTP 인증, 토큰 재발급
│   ├── match.js         # 서버 사이드 상대방 매칭 및 필터링 알고리즘
│   ├── chat.js          # 하트 10개 차감 검증 + 서버 LLM 프록시 + 감성 선물 처리
│   ├── media.js         # 비밀 사진첩 열람 시 하트 차감 및 URL 인가
│   └── payment.js       # 패키지 주문 생성 및 결제사 승인 검증
├── services/
│   ├── dbService.js     # 유저 계정, 하트 잔액, 주문 내역 영속 저장소
│   ├── characterService.js # 캐릭터 원본 페르소나 및 비공개 프롬프트 엔진
│   └── llmService.js    # Gemini 1.5 Flash / GPT-4o-mini 안전 호출
├── Dockerfile           # OCI 배포용 멀티스테이지 컨테이너 이미지
├── docker-compose.yml   # 1방 실행용 도커 컴포즈
├── server.js            # Express 마스터 엔드포인트
└── .env.example         # OCI 환경변수 템플릿
```

---

## 3. OCI(Oracle Cloud) 인스턴스 배포 절차 (Step-by-Step)

### Step 1: OCI Compute 인스턴스 생성
1. OCI 콘솔 ➔ **Compute** ➔ **Instances** ➔ **Create Instance** 클릭
2. **Image**: `Oracle Linux 8/9` 또는 `Ubuntu 22.04 LTS` 선택
3. **Shape**:
   - Always Free 사용 시: `VM.Standard.A1.Flex` (Ampere 4 OCPU, 24GB RAM 무료) 또는 `VM.Standard.E2.1.Micro` 선택
4. **Networking**: Public Subnet 할당 및 공인 IP(Public IP) 부여

### Step 2: OCI 가상 클라우드 네트워크(VCN) 포트 개방
1. 인스턴스가 속한 VCN ➔ **Security Lists** ➔ **Default Security List** 이동
2. **Add Ingress Rules**:
   - `Source CIDR`: `0.0.0.0/0`
   - `IP Protocol`: `TCP`
   - `Destination Port Range`: `80, 443, 4000`

### Step 3: 인스턴스 접속 및 도커 설치
SSH를 통해 OCI 인스턴스에 접속합니다:
```bash
ssh -i <your-private-key> opc@<YOUR_OCI_PUBLIC_IP>

# Oracle Linux 패키지 업데이트 및 Docker 설치
sudo dnf install -y dnf-utils zip unzip
sudo dnf config-manager --add-repo=https://download.docker.com/linux/centos/docker-ce.repo
sudo dnf install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
sudo systemctl enable --now docker
sudo usermod -aG docker $USER
```

### Step 4: 소스코드 다운로드 및 환경변수 설정
```bash
# 1. 깃 레포지토리 클론
git clone https://github.com/gstorich/seollem-ai-lounge.git
cd seollem-ai-lounge

# 2. 백엔드 환경변수 파일 생성
cp server/.env.example server/.env
nano server/.env
```
`.env` 파일에 아래 필수 항목을 입력합니다:
```ini
PORT=4000
NODE_ENV=production
JWT_SECRET=your_actual_random_jwt_secret_key_here
GEMINI_API_KEY=AIzaSy...실제_구글_제미나이_API_키
```

### Step 5: Docker Compose로 무중단 실행
```bash
cd server
docker compose up -d --build

# 서버 구동 로그 확인
docker compose logs -f
```
`http://<YOUR_OCI_PUBLIC_IP>:4000/api/health` 로 접속하여 `{"status":"ok"}`가 반환되면 정상 구동된 것입니다.

---

## 4. Caddy를 이용한 자동 SSL(HTTPS) 연동 (권장)
사용자 도메인을 연결하고 무료 HTTPS를 3분 만에 적용하려면 Caddy를 사용합니다:
```bash
sudo dnf install 'dnf-command(copr)' -y
sudo dnf copr enable @caddy/caddy -y
sudo dnf install caddy -y

# Caddy 설정 파일 작성
sudo nano /etc/caddy/Caddyfile
```
```caddyfile
your-domain.com {
    reverse_proxy localhost:4000
}
```
```bash
sudo systemctl enable --now caddy
```
이제 `https://your-domain.com` 접속 시 자동으로 SSL 인증서가 발급되며 안전한 백엔드 API 환경이 완성됩니다.
