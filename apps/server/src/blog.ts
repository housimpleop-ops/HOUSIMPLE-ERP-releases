import * as cheerio from "cheerio";
import type { SearchResult } from "./schema.js";
import { HttpError } from "./util.js";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "ko-KR,ko;q=0.9" }, redirect: "follow" });
  if (!res.ok) throw new HttpError(502, `페이지 요청 실패: ${res.status} ${url}`);
  return res.text();
}

/** 만개의레시피 검색 (공식 API 없음 → 목록 페이지 파싱) */
export async function search10000Recipe(query: string, max = 10): Promise<SearchResult[]> {
  const url = `https://www.10000recipe.com/recipe/list.html?q=${encodeURIComponent(query)}`;
  const $ = cheerio.load(await fetchHtml(url));
  const out: SearchResult[] = [];
  $(".common_sp_list_ul .common_sp_list_li").each((_, el) => {
    if (out.length >= max) return;
    const a = $(el).find("a.common_sp_link").first();
    const href = a.attr("href") ?? "";
    const title = $(el).find(".common_sp_caption_tit").text().trim();
    const img = $(el).find(".common_sp_thumb img").attr("src") ?? "";
    const author = $(el).find(".common_sp_caption_rv_name").text().trim();
    if (!href || !title) return;
    const full = href.startsWith("http") ? href : `https://www.10000recipe.com${href}`;
    out.push({ id: full, type: "blog", title, thumbnail: img, author, url: full, durationSec: null, description: "" });
  });
  return out;
}

export type BlogExtract = {
  url: string;
  siteName: string;
  title: string;
  author: string;
  thumbnail: string;
  /** LLM에 넘길 본문 텍스트 (구조화된 JSON-LD가 있으면 그것을 우선 포함) */
  text: string;
};

/** 블로그/레시피 사이트 본문 추출. 네이버 블로그·티스토리·만개의레시피·일반 페이지 */
export async function extractBlog(inputUrl: string): Promise<BlogExtract> {
  let url = inputUrl.trim();
  const host = new URL(url).hostname;

  // 네이버 블로그는 본문이 iframe(PostView) 안에 있음 → 직접 PostView 주소로 바꿔서 요청
  if (host.endsWith("blog.naver.com")) {
    const m = url.match(/blog\.naver\.com\/([^/?]+)\/(\d+)/) ?? url.match(/blogId=([^&]+).*logNo=(\d+)/);
    if (m) url = `https://blog.naver.com/PostView.naver?blogId=${m[1]}&logNo=${m[2]}`;
  }

  const html = await fetchHtml(url);
  const $ = cheerio.load(html);
  $("script:not([type='application/ld+json']), style, nav, footer, header, iframe, noscript").remove();

  const og = (p: string) => $(`meta[property='og:${p}']`).attr("content")?.trim() ?? "";
  let title = og("title") || $("title").text().trim();
  const thumbnail = og("image");
  const siteName = og("site_name") || host;
  let author = $("meta[name='author']").attr("content")?.trim() ?? "";

  // 1) schema.org Recipe JSON-LD — 가장 정확
  let ld = "";
  $("script[type='application/ld+json']").each((_, el) => {
    try {
      const j = JSON.parse($(el).text());
      const arr = Array.isArray(j) ? j : j["@graph"] ? j["@graph"] : [j];
      for (const node of arr) {
        const t = node?.["@type"];
        if (t === "Recipe" || (Array.isArray(t) && t.includes("Recipe"))) {
          ld = JSON.stringify(node, null, 1);
          if (node.name) title = node.name;
          if (node.author?.name) author = node.author.name;
        }
      }
    } catch {
      /* ignore */
    }
  });

  // 2) 사이트별 본문 셀렉터
  let body = "";
  if (host.includes("10000recipe.com")) {
    const ing = $("#divConfirmedMaterialArea").text();
    const steps = $(".view_step").text();
    const tip = $(".view_step_tip, #recipeTip").text();
    body = `${ing}\n\n[조리순서]\n${steps}\n\n[팁]\n${tip}`;
    author = author || $(".user_info2_name, .profile_cont .user_name").first().text().trim();
  } else if (host.endsWith("blog.naver.com")) {
    body = $(".se-main-container").text() || $("#postViewArea").text() || $("body").text();
    author = author || $(".nick, .blog_author").first().text().trim();
  } else if (host.includes("tistory.com")) {
    body = $(".tt_article_useless_p_margin, .entry-content, .article, #article, .contents_style").first().text() || $("body").text();
  } else {
    body = $("article").first().text() || $("main").first().text() || $("body").text();
  }
  body = body.replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();

  const text = [ld ? `[구조화 데이터 JSON-LD]\n${ld}` : "", `[본문]\n${body.slice(0, 20000)}`].filter(Boolean).join("\n\n");
  if (text.length < 80) throw new HttpError(422, "본문을 읽을 수 없습니다 (로그인 필요 또는 차단된 페이지일 수 있음)");
  return { url: inputUrl, siteName, title, author, thumbnail, text };
}
