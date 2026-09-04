# 레시피 타임라인 (recipe-timeline-app)

유튜브 · 블로그의 요리법을 검색하고, **재료 / 조리 순서**로 정리한 뒤,
각 단계를 누르면 **영상의 해당 장면으로 바로 점프**하는 모바일 앱입니다.

```
apps/
  mobile/   Expo(React Native) 앱 — Android/iOS 한 코드베이스
  server/   Node(Hono) API — 검색 · 자막/본문 추출 · Claude 구조화 · 캐시(SQLite)
```

## 동작 원리 (4개 부품)

| 단계 | 유튜브 | 블로그 (만개의레시피 · 네이버 · 티스토리) |
|---|---|---|
| ① 검색 | YouTube Data API v3 (`search.list`) | 만개의레시피 목록 페이지 파싱. 네이버/티스토리는 URL 붙여넣기 |
| ② 원문 추출 | 자막(timedtext) + 설명란 챕터(`0:35 재료 손질`) | 본문 HTML → schema.org Recipe JSON-LD 우선, 없으면 본문 텍스트 |
| ③ 구조화 | Claude(구조화 출력) → 재료·순서·**단계별 시작/종료 초** JSON | Claude → 재료·순서 (시간 없음) |
| ④ 표시 | 앱: 유튜브 임베드 플레이어 + 단계 탭 → `seekTo(초)` | 앱: 텍스트 카드 |

정리 결과는 서버 SQLite에 캐시되므로 같은 영상은 두 번 결제되지 않습니다.

## 1. API 키 발급

### YouTube Data API v3 (무료, 하루 10,000 유닛 ≈ 검색 100회)
1. https://console.cloud.google.com/ 접속 → 프로젝트 새로 만들기
2. 「API 및 서비스 → 라이브러리」에서 **YouTube Data API v3** 검색 → 사용 설정
3. 「사용자 인증 정보 → 사용자 인증 정보 만들기 → API 키」 → 키 복사
4. (권장) 키 제한: API 제한 → YouTube Data API v3 만 허용

### Anthropic (Claude) API
1. https://console.anthropic.com/ 가입 → 결제수단 등록(선불 크레딧, $5부터)
2. 「API Keys → Create Key」 → `sk-ant-...` 복사
3. 비용 감: 영상 1개 정리 ≈ 자막 1~2만 토큰 입력 → `claude-opus-5` 기준 약 $0.05~0.15, `claude-sonnet-5` 로 바꾸면 약 1/3

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
| GET | `/recipe/youtube/:videoId?refresh=1` | 영상 → 레시피 JSON (캐시) |
| POST | `/recipe/url` `{url, refresh?}` | 블로그 URL → 레시피 JSON. 유튜브 URL이면 위로 리다이렉트 |
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

- **자막 수집은 비공식 방식**입니다(유튜브 watch 페이지의 captionTracks). 개인 PC/가정 IP에서는 잘 되지만,
  클라우드 서버 IP에서는 유튜브가 차단하는 경우가 있습니다. 차단되면 자동으로 설명란 챕터만으로 정리하고,
  챕터도 없으면 단계별 점프 없이 텍스트만 나옵니다. 상용화 시 대안: 서버에서 오디오 → Whisper 음성인식.
- 자막 없는 영상은 시간 정보가 부정확할 수 있습니다. 앱에 「다시 정리하기」 버튼이 있습니다.
- 만개의레시피 검색은 사이트 HTML 구조에 의존합니다. 구조가 바뀌면 `apps/server/src/blog.ts` 의 셀렉터 수정.
- 네이버 블로그는 본문이 iframe 안에 있어 `PostView.naver` 주소로 바꿔 읽습니다.

## 5. 다음 단계 (상업화 로드맵)

1. **서버 호스팅** — Railway / Fly.io (월 $5 내외). SQLite → Postgres(Supabase) 로 교체
2. **로그인·즐겨찾기** — Supabase Auth, 사용자별 저장 레시피
3. **광고** — `react-native-google-mobile-ads` (배너 + 레시피 정리 완료 시 전면광고). 개발 빌드 필요
4. **비용 통제** — 사용자당 하루 정리 횟수 제한, 인기 레시피는 캐시 공유 (이미 구조상 가능)
5. **스토어 출시** — EAS Build → Play 스토어 / App Store

## 개발 메모

- 서버: `npm run typecheck`, `npm test` (파서 단위 테스트)
- 앱: `npm run typecheck`, `npx expo export --platform android` (번들 확인)
- 서버 스키마(`apps/server/src/schema.ts`)와 앱 타입(`apps/mobile/lib/types.ts`)은 같은 모양을 유지할 것
