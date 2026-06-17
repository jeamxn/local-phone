# local-phone

WebRTC P2P 실시간 통화 + Gemini 실시간 번역 앱.

상대방 음성을 **내가 선택한 언어로** 실시간 번역해서 들려준다. 원본/번역/동시 듣기를 토글할 수 있고, 영상통화·화면공유·채팅도 지원한다.

## 구성 (pnpm monorepo)

| 패키지 | 설명 | 포트 |
|--------|------|------|
| `apps/web` | React Router v7 (SSR) + antd 프런트엔드. 통화 UI 전부 | 3000 |
| `apps/api` | NestJS + Socket.IO 시그널링 게이트웨이 + 채팅 릴레이 + **Gemini Live 번역 릴레이** (Vertex AI SA 인증) | 8080 |

### 왜 번역을 서버에서 하나?

Vertex 서비스 계정 크레덴셜을 브라우저에 노출할 수 없다. 그래서:

- **원본 미디어(음성/영상/화면)** = 브라우저 ↔ 브라우저 **P2P WebRTC** 직통 (저지연)
- **번역 오디오** = 내 마이크 PCM을 시그널 서버로 보냄 → 서버가 *듣는 사람의 언어*로 `gemini-3.5-live-translate-preview` 세션을 열어 번역 오디오를 받아서 WebSocket으로 되돌려줌
- 클라이언트는 원본(P2P) / 번역(WS) / 동시 중 선택해서 재생

## 주요 기능

1. 입장 시 이름·구사 언어 선택
2. 실시간 번역 (원본 듣기 / 번역만 듣기 / 동시에 듣기)
3. 텍스트 채팅
4. 카메라 on/off
5. 화면공유
6. 회의별 코드 자동 생성 — 코드/URL 공유하면 바로 입장
7. 입장 후 이름 변경

## 로컬 실행

```bash
pnpm install
cp .env.example .env   # Vertex SA 값 채우기
# 터미널 2개
pnpm dev:api
pnpm dev:web
# http://localhost:3000
```

## 배포

루트 `docker-compose.yml` 참고. Dokploy/Coolify에서 빌드되며 web(3000)/api(8080) 두 서비스를 띄운다.

- 호스트 포트 바인딩(`ports`) 대신 `expose`만 쓰고, PaaS(Traefik)에서 **web→3000 / api→8080** 으로 각각 도메인을 매핑한다. 브라우저가 소켓(api)에 직접 붙으므로 api에도 공개 도메인이 필요하다.
- `VITE_SIGNAL_URL`은 web 클라이언트 번들에 **빌드타임**에 박힌다. compose의 build args로 실제 api 공개 URL(예: `https://api.example.com`)을 넣고, 도메인이 바뀌면 web을 재빌드해야 한다.
- Vertex 환경변수는 PaaS UI/.env에 넣는다. PEM 멀티라인이 깨지면 `VERTEX_PRIVATE_KEY_B64`(base64 한 줄)를 대신 사용:
  ```bash
  base64 -w0 < private_key.pem
  ```
- 카메라/마이크/화면공유는 **HTTPS(또는 localhost)** 에서만 동작한다. 배포 도메인은 반드시 https.
