# 레시피 타임라인 (recipe-timeline-app)

유튜브 · 블로그의 요리법을 검색하고, **재료 / 조리 순서**로 정리한 뒤,
각 단계를 누르면 **영상의 해당 장면으로 바로 점프**하는 모바일 앱입니다.

```
apps/
  mobile/   Expo(React Native) 앱 — Android/iOS 한 코드베이스
  server/   Node(Hono) API — 검색 · 자막/본문 추출 · Claude 구조화 · 캐시(SQLite)
```

## 동작 원리

### 왜 폰이 직접 읽는가

자막도 블로그 본문도 유튜브와 네이버가 **시청자 브라우저에 무료로 내려주는 데이터**입니다.
문제는 데이터가 잠긴 게 아니라 **누가 요청하느냐**입니다. 데이터센터 IP로 요청하면 봇으로 분류되지만,
폰에서 요청하면 그냥 시청자 1명입니다.

그래서 이 앱은 **원문 읽기를 폰이 하고, 서버는 정리와 캐시만** 합니다.
폰 안의 보이지 않는 WebView가 페이지를 열어 자막·본문만 뽑아내고, 그 텍스트만 서버로 보냅니다.
서버는 외부 사이트에 접속하지 않으므로 클라우드 IP 차단의 영향을 받지 않습니다.
부수 효과로 사용자가 늘어도 읽기 부하는 각자 폰이 나눠 갖습니다.

```
[폰] 숨은 WebView → 유튜브/블로그 페이지 읽기 → 원문 텍스트
                                                   ↓
[서버] Claude 구조화 → 재료·순서·단계별 초(秒) → SQLite 캐시
                                                   ↓
[폰] 유튜브 플레이어 + 단계 목록 → 단계 누르면 seekTo(초)
```

### 4개 부품

| 단계 | 유튜브 | 블로그 (만개의레시피 · 네이버 · 티스토리) |
|---|---|---|
| ① 검색 | YouTube Data API v3 (공식) | 네이버 검색 API (공식) + 만개의레시피 목록 파싱 |
| ② 원문 추출 | **폰**이 자막(timedtext) + 설명란 챕터(`0:35 재료 손질`) 읽기 | **폰**이 JSON-LD Recipe 우선, 없으면 본문 텍스트 읽기 |
| ③ 구조화 | 서버 → Claude → 재료·순서·**단계별 시작/종료 초** JSON | 서버 → Claude → 재료·순서 (시간 없음) |
| ④ 표시 | 유튜브 임베드 플레이어 + 단계 탭 → `seekTo(초)` | 텍스트 카드 |

정리 결과는 서버 SQLite에 캐시되므로 같은 영상은 두 번 결제되지 않습니다.

### 실패해도 멈추지 않는 사다리

레시피 한 건을 불러오는 순서입니다. 앞이 실패하면 자동으로 다음으로 넘어갑니다.

1. **서버 캐시** — 이미 정리된 것이면 즉시 표시 (Claude 호출 없음)
2. **폰이 읽기** — 숨은 WebView. 20초 안에 못 읽으면 다음으로
3. **서버가 읽기** — 기존 방식. 서버 IP가 허용되는 환경이면 동작
4. 자막이 없으면 **설명란 챕터**로 타임라인 구성
5. 챕터도 없으면 시간 정보 없이 **재료와 순서만** 표시

## 1. API 키 발급

### YouTube Data API v3 (무료, 하루 10,000 유닛 ≈ 검색 100회) — 필수
1. https://console.cloud.google.com/ 접속 → 프로젝트 새로 만들기
2. 「API 및 서비스 → 라이브러리」에서 **YouTube Data API v3** 검색 → 사용 설정
3. 「사용자 인증 정보 → 사용자 인증 정보 만들기 → API 키」 → 키 복사
4. (권장) 키 제한: API 제한 → YouTube Data API v3 만 허용

### Anthropic (Claude) API — 필수
1. https://console.anthropic.com/ 가입 → 결제수단 등록(선불 크레딧, $5부터)
2. 「API Keys → Create Key」 → `sk-ant-...` 복사
3. 비용 감: 영상 1개 정리 ≈ 자막 1~2만 토큰 입력 → `claude-opus-5` 기준 약 $0.05~0.15, `claude-sonnet-5` 로 바꾸면 약 1/3

### 네이버 검색 API (무료) — 선택
1. https://developers.naver.com/apps 에서 애플리케이션 등록
2. 사용 API에 **검색** 추가 → Client ID와 Client Secret 발급
3. 파싱이 아니라 정식 API라 차단 위험이 없습니다. 키를 넣지 않으면 네이버 검색만 조용히 건너뜁니다.

## 2. 서버 실행 (PC)

```bash
cd apps/server
cp .env.example .env      # 파일 열어서 두 키 입력
npm install
npm run dev               # http://0.0.0.0:8787
```

확인:
```bash
curl "http://localhost:8787/search?q=김치찌개&source=youtube"
curl "http://localhost:8787/recipe/youtube/<videoId>"
curl -X POST http://localhost:8787/recipe/url -H 'content-type: application/json' \
     -d '{"url":"https://www.10000recipe.com/recipe/6845942"}'
```

### API 요약

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/search?q=&source=all\|youtube\|blog` | 검색 (6시간 캐시) |
| POST | `/recipe/from-content` | **폰이 읽은 원문 → 레시피 JSON.** 서버가 외부 접속을 하지 않는 기본 경로 |
| GET | `/recipe/cached/:id` | 캐시에 있으면 반환, 없으면 404 |
| GET | `/recipe/youtube/:videoId?refresh=1` | (대체 경로) 서버가 직접 영상을 읽어 정리 |
| POST | `/recipe/url` `{url, refresh?}` | (대체 경로) 서버가 직접 블로그를 읽어 정리 |
| GET | `/recipes/recent` | 최근 정리한 레시피 30개 |
| GET | `/health` | 상태 확인 |

환경변수 `APP_API_KEY` 를 설정하면 `x-app-key` 헤더가 같아야 통과합니다 (외부 공개 시 필수).

## 3. 앱 실행 (핸드폰)

1. 폰에 **Expo Go** 설치 (Play 스토어 / App Store)
2. PC와 폰이 **같은 와이파이**에 있어야 합니다. PC 내부 IP 확인 (`ipconfig` → IPv4)
3. ```bash
   cd apps/mobile
   cp .env.example .env    # EXPO_PUBLIC_API_URL=http://<PC내부IP>:8787
   npm install
   npx expo start
   ```
4. 터미널의 QR 코드를 Expo Go로 스캔
5. 앱 안 「⚙ 설정」에서 서버 주소를 바꿀 수도 있습니다

> 유튜브 플레이어는 WebView 기반이라 **Expo Go에서 바로 동작**합니다. 광고(AdMob)를 붙이는 단계부터는
> `npx expo run:android` 또는 EAS Build 로 개발용 빌드가 필요합니다.

## 4. 알아둘 제약

- **유튜브 공식 API로는 남의 영상 자막을 받을 수 없습니다.** `captions.download` 는 본인 채널 영상만 허용합니다.
  그래서 자막은 폰의 WebView가 watch 페이지에서 읽습니다. 폰은 통신사·가정 IP라 일반 시청자와 구분되지 않습니다.
- 자막이 아예 없는 영상은 설명란 챕터로 대체하고, 그것도 없으면 단계별 점프 없이 텍스트만 나옵니다.
  최종 대안은 오디오 → Whisper 음성인식이며 아직 붙이지 않았습니다.
- 만개의레시피 검색은 사이트 HTML 구조에 의존합니다. 구조가 바뀌면 `apps/server/src/blog.ts` 의 셀렉터를 수정하세요.
  본문 추출 셀렉터는 `apps/mobile/lib/inject.ts` 에 있습니다.
- 네이버 블로그는 본문이 iframe 안에 있어 `PostView.naver` 주소로 바꿔 읽습니다.
- 서버의 모든 외부 호출에는 12초 제한 시간이 걸려 있습니다. 느린 사이트가 요청 전체를 붙잡지 않습니다.

## 5. 다음 단계 (상업화 로드맵)

1. **서버 호스팅** — Railway / Fly.io (월 $5 내외). SQLite → Postgres(Supabase) 로 교체
2. **로그인·즐겨찾기** — Supabase Auth, 사용자별 저장 레시피
3. **광고** — `react-native-google-mobile-ads` (배너 + 레시피 정리 완료 시 전면광고). 개발 빌드 필요
4. **비용 통제** — 사용자당 하루 정리 횟수 제한, 인기 레시피는 캐시 공유 (이미 구조상 가능)
5. **스토어 출시** — EAS Build → Play 스토어 / App Store

## 개발 메모

- 서버: `npm run typecheck`, `npm test` (파서 · 제한시간 테스트 8개)
- 앱: `npm run typecheck`, `npm test` (주입 스크립트를 가짜 DOM에서 실제로 실행하는 테스트 8개),
  `npx expo export --platform android` (번들 확인)
- 서버 스키마(`apps/server/src/schema.ts`)와 앱 타입(`apps/mobile/lib/types.ts`)은 같은 모양을 유지할 것
- 폰에서 읽는 스크립트는 `apps/mobile/lib/inject.ts` 한 곳에 모여 있습니다. 사이트 구조가 바뀌면 여기만 고치면 됩니다.
