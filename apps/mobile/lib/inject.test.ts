import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { YOUTUBE_JS, BLOG_JS, normalizeUrl } from "./inject.ts";
import type { ExtractResult } from "./inject.ts";

/** 주입 스크립트를 가짜 DOM 위에서 실제로 실행하고 postMessage 결과를 받는다 */
async function run(script: string, sandbox: Record<string, unknown>): Promise<ExtractResult> {
  return new Promise((resolve, reject) => {
    const ctx: Record<string, unknown> = {
      ...sandbox,
      setTimeout,
      clearTimeout,
      JSON,
      Number,
      String,
      Array,
      Object,
      console,
    };
    ctx.window = ctx;
    (ctx as { ReactNativeWebView?: unknown }).ReactNativeWebView = {
      postMessage: (s: string) => resolve(JSON.parse(s) as ExtractResult),
    };
    const guard = setTimeout(() => reject(new Error("결과가 오지 않음")), 9000);
    if (typeof guard === "object") guard.unref();
    vm.runInNewContext(script, ctx);
  });
}

const PLAYER = {
  videoDetails: {
    videoId: "abc12345678",
    title: "5분 김치찌개",
    author: "집밥백선생",
    shortDescription: "재료와 순서\n0:00 인트로\n0:35 재료 손질\n[2:10] 볶기\n(4:05) - 끓이기",
    lengthSeconds: "480",
    thumbnail: { thumbnails: [{ url: "low.jpg" }, { url: "high.jpg" }] },
  },
  captions: {
    playerCaptionsTracklistRenderer: {
      captionTracks: [
        { languageCode: "en", kind: "asr", baseUrl: "https://x/en" },
        { languageCode: "ko", kind: "asr", baseUrl: "https://x/ko-auto" },
        { languageCode: "ko", baseUrl: "https://x/ko" },
      ],
    },
  },
};

const JSON3 = {
  events: [
    { tStartMs: 500, segs: [{ utf8: "안녕" }, { utf8: "하세요" }] },
    { tStartMs: 35000, segs: [{ utf8: "양파를  썰어" }] },
    { tStartMs: 40000 }, // segs 없음 → 버림
    { tStartMs: 45000, segs: [{ utf8: "  " }] }, // 공백만 → 버림
  ],
};

test("유튜브: 한국어 수동자막을 고르고 자막·챕터를 뽑는다", async () => {
  let asked = "";
  const r = await run(YOUTUBE_JS, {
    ytInitialPlayerResponse: PLAYER,
    document: { documentElement: { innerHTML: "" }, title: "" },
    fetch: (u: string) => {
      asked = u;
      return Promise.resolve({ json: () => Promise.resolve(JSON3) });
    },
  });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  // asr(자동생성)이 아닌 한국어 트랙을 골라야 한다
  assert.match(asked, /^https:\/\/x\/ko&fmt=json3$/);
  assert.equal(r.title, "5분 김치찌개");
  assert.equal(r.author, "집밥백선생");
  assert.equal(r.durationSec, 480);
  assert.equal(r.thumbnail, "high.jpg");
  assert.deepEqual(r.chapters, [
    { sec: 0, label: "인트로" },
    { sec: 35, label: "재료 손질" },
    { sec: 130, label: "볶기" },
    { sec: 245, label: "끓이기" },
  ]);
  assert.deepEqual(r.transcript, [
    { start: 0.5, text: "안녕하세요" },
    { start: 35, text: "양파를 썰어" },
  ]);
});

test("유튜브: 자막이 없어도 설명란만으로 성공한다", async () => {
  const noCaptions = { videoDetails: PLAYER.videoDetails };
  const r = await run(YOUTUBE_JS, {
    ytInitialPlayerResponse: noCaptions,
    document: { documentElement: { innerHTML: "" }, title: "" },
    fetch: () => Promise.reject(new Error("호출되면 안 됨")),
  });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.deepEqual(r.transcript, []);
  assert.equal(r.chapters.length, 4);
});

test("유튜브: 자막 요청이 실패해도 나머지 정보는 살린다", async () => {
  const r = await run(YOUTUBE_JS, {
    ytInitialPlayerResponse: PLAYER,
    document: { documentElement: { innerHTML: "" }, title: "" },
    fetch: () => Promise.reject(new Error("network")),
  });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.deepEqual(r.transcript, []);
  assert.equal(r.title, "5분 김치찌개");
});

test("유튜브: 전역 변수가 없으면 HTML에서 찾아낸다", async () => {
  const r = await run(YOUTUBE_JS, {
    document: {
      documentElement: { innerHTML: `<script>var ytInitialPlayerResponse = ${JSON.stringify(PLAYER)};</script>` },
      title: "",
    },
    fetch: () => Promise.resolve({ json: () => Promise.resolve(JSON3) }),
  });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.videoId, "abc12345678");
});

/** 최소한의 가짜 document — querySelector 로 셀렉터별 텍스트를 돌려준다 */
function fakeDoc(map: Record<string, string>, host: string, metas: Record<string, string> = {}) {
  return {
    document: {
      title: "문서 제목",
      querySelector: (sel: string) => {
        const meta = sel.match(/meta\[(?:property|name)='(?:og:)?([^']+)'\]/);
        if (meta) return metas[meta[1]] ? { getAttribute: () => metas[meta[1]] } : null;
        return map[sel] !== undefined ? { innerText: map[sel], textContent: map[sel] } : null;
      },
      querySelectorAll: (sel: string) =>
        sel.includes("ld+json") && map.__ld ? [{ textContent: map.__ld }] : [],
      getElementById: () => null,
    },
    location: { hostname: host },
  };
}

test("블로그: 만개의레시피 셀렉터로 재료·순서·팁을 모은다", async () => {
  const r = await run(
    BLOG_JS,
    fakeDoc(
      {
        "#divConfirmedMaterialArea": "돼지고기 앞다리살 200g, 신김치 1/4포기, 양파 1개, 대파 1대, 두부 반모, 고춧가루 2큰술, 다진마늘 1큰술, 국간장 1큰술, 설탕 약간, 쌀뜨물 500ml",
        ".view_step": "1. 냄비에 기름을 두르고 돼지고기를 볶는다. 2. 김치를 넣고 함께 볶는다. 3. 쌀뜨물을 붓고 센불에 끓인다. 4. 양파와 두부를 넣고 10분 더 끓인다. 5. 대파를 올리고 마무리한다.",
        "#recipeTip": "신김치일수록 맛있습니다",
      },
      "www.10000recipe.com",
      { title: "김치찌개", image: "thumb.jpg", site_name: "만개의레시피" },
    ),
  );
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.title, "김치찌개");
  assert.equal(r.siteName, "만개의레시피");
  assert.match(r.description, /조리순서/);
  assert.match(r.description, /신김치일수록/);
  assert.equal(r.transcript.length, 0);
  assert.equal(r.durationSec, null);
});

test("블로그: JSON-LD Recipe 가 있으면 제목·작성자를 그것에서 가져온다", async () => {
  const ld = JSON.stringify({
    "@type": "Recipe",
    name: "된장찌개",
    author: { name: "요리하는아빠" },
    recipeIngredient: ["된장 2큰술", "두부 반모"],
  });
  const r = await run(
    BLOG_JS,
    fakeDoc(
      { __ld: ld, article: "된장을 풀고 두부를 넣어 끓인다. ".repeat(12) },
      "someblog.tistory.com",
      { title: "무시되어야 함" },
    ),
  );
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.title, "된장찌개");
  assert.equal(r.author, "요리하는아빠");
  assert.match(r.description, /JSON-LD/);
});

test("블로그: 본문이 비면 실패로 알린다", async () => {
  const r = await run(BLOG_JS, fakeDoc({ body: "짧음" }, "example.com"));
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.match(r.error, /본문을 읽지 못했습니다/);
});

test("네이버 블로그 주소를 PostView 주소로 바꾼다", () => {
  assert.equal(
    normalizeUrl("https://blog.naver.com/chef123/223456789"),
    "https://blog.naver.com/PostView.naver?blogId=chef123&logNo=223456789",
  );
  assert.equal(normalizeUrl("https://www.10000recipe.com/recipe/1"), "https://www.10000recipe.com/recipe/1");
});
