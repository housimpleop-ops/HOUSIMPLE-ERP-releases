import "dotenv/config";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { serve } from "@hono/node-server";
import { searchYoutube, getVideoDetails, fetchTranscript, transcriptToText, extractChapters } from "./youtube.js";
import { search10000Recipe, extractBlog } from "./blog.js";
import { structureRecipe } from "./llm.js";
import { getRecipe, saveRecipe, listRecent, getSearchCache, putSearchCache } from "./db.js";
import { extractYoutubeId, HttpError } from "./util.js";
import type { RecipeDoc, SearchResult } from "./schema.js";

const app = new Hono();
app.use("*", logger());
app.use("*", cors());

// 간단한 앱 키 (선택). APP_API_KEY 를 설정하면 x-app-key 헤더가 일치해야 통과
app.use("*", async (c, next) => {
  const required = process.env.APP_API_KEY;
  if (required && c.req.path !== "/health" && c.req.header("x-app-key") !== required) {
    return c.json({ error: "unauthorized" }, 401);
  }
  await next();
});

app.get("/health", (c) => c.json({ ok: true, time: new Date().toISOString() }));

/** GET /search?q=김치찌개&source=youtube|blog|all */
app.get("/search", async (c) => {
  const q = (c.req.query("q") ?? "").trim();
  const source = c.req.query("source") ?? "all";
  if (!q) throw new HttpError(400, "q 파라미터가 필요합니다");
  const key = `${source}:${q}`;
  const cached = getSearchCache<SearchResult[]>(key);
  if (cached) return c.json({ query: q, results: cached, cached: true });

  const jobs: Promise<SearchResult[]>[] = [];
  if (source === "youtube" || source === "all") jobs.push(searchYoutube(q));
  if (source === "blog" || source === "all") jobs.push(search10000Recipe(q).catch(() => []));
  const results = (await Promise.all(jobs)).flat();
  putSearchCache(key, results);
  return c.json({ query: q, results, cached: false });
});

/** GET /recipe/youtube/:videoId — 자막+설명 → 구조화 (캐시) */
app.get("/recipe/youtube/:videoId", async (c) => {
  const videoId = c.req.param("videoId");
  const force = c.req.query("refresh") === "1";
  const id = `yt:${videoId}`;
  const hit = force ? null : getRecipe(id);
  if (hit) return c.json({ ...hit, cached: true });

  const [details, transcript] = await Promise.all([getVideoDetails(videoId), fetchTranscript(videoId)]);
  const chapters = extractChapters(details.description);
  const { recipe, usage } = await structureRecipe({
    sourceType: "youtube",
    title: details.title,
    author: details.channelTitle,
    description: details.description,
    chapters,
    transcript: transcriptToText(transcript),
    durationSec: details.durationSec,
  });
  const doc: RecipeDoc = {
    id,
    source: {
      type: "youtube",
      url: `https://www.youtube.com/watch?v=${videoId}`,
      videoId,
      siteName: "YouTube",
      author: details.channelTitle,
      thumbnail: details.thumbnail,
      durationSec: details.durationSec,
      hasTranscript: transcript.length > 0,
    },
    recipe,
    createdAt: new Date().toISOString(),
  };
  saveRecipe(doc);
  return c.json({ ...doc, cached: false, usage });
});

/** POST /recipe/url { url } — 유튜브 URL이면 위 라우트로, 아니면 블로그 추출 */
app.post("/recipe/url", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { url?: string; refresh?: boolean };
  const url = (body.url ?? "").trim();
  if (!url) throw new HttpError(400, "url 이 필요합니다");
  const vid = extractYoutubeId(url);
  if (vid) return c.redirect(`/recipe/youtube/${vid}${body.refresh ? "?refresh=1" : ""}`, 307);

  const id = `url:${url}`;
  const hit = body.refresh ? null : getRecipe(id);
  if (hit) return c.json({ ...hit, cached: true });

  const ex = await extractBlog(url);
  const { recipe, usage } = await structureRecipe({
    sourceType: "blog",
    title: ex.title,
    author: ex.author,
    description: ex.text,
    chapters: [],
    transcript: "",
    durationSec: null,
  });
  const doc: RecipeDoc = {
    id,
    source: { type: "blog", url, videoId: null, siteName: ex.siteName, author: ex.author, thumbnail: ex.thumbnail, durationSec: null, hasTranscript: false },
    recipe,
    createdAt: new Date().toISOString(),
  };
  saveRecipe(doc);
  return c.json({ ...doc, cached: false, usage });
});

/** GET /recipes/recent — 최근 정리한 레시피 (홈 화면용) */
app.get("/recipes/recent", (c) => c.json({ results: listRecent(30) }));

/** GET /recipe/:id — 저장된 문서 (id는 URL 인코딩) */
app.get("/recipe/:id", (c) => {
  const doc = getRecipe(decodeURIComponent(c.req.param("id")));
  if (!doc) throw new HttpError(404, "없는 레시피입니다");
  return c.json(doc);
});

app.onError((err, c) => {
  if (err instanceof HttpError) return c.json({ error: err.message }, err.status as 400);
  console.error(err);
  return c.json({ error: err.message ?? "server error" }, 500);
});

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port, hostname: "0.0.0.0" }, (info) => {
  console.log(`recipe-timeline-server listening on http://0.0.0.0:${info.port}`);
});
