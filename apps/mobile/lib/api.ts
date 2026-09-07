import { loadSettings } from "./settings";
import type { RecipeDoc, SearchResult } from "./types";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const { apiUrl, appKey } = await loadSettings();
  const res = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(appKey ? { "x-app-key": appKey } : {}), ...(init?.headers ?? {}) },
  });
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(body.error ?? `요청 실패 (${res.status})`);
  return body as T;
}

export type SourceFilter = "all" | "youtube" | "blog";

export function search(q: string, source: SourceFilter) {
  return request<{ query: string; results: SearchResult[]; cached: boolean }>(
    `/search?q=${encodeURIComponent(q)}&source=${source}`,
  );
}

export function recipeByYoutube(videoId: string, refresh = false) {
  return request<RecipeDoc>(`/recipe/youtube/${videoId}${refresh ? "?refresh=1" : ""}`);
}

export function recipeByUrl(url: string, refresh = false) {
  return request<RecipeDoc>(`/recipe/url`, { method: "POST", body: JSON.stringify({ url, refresh }) });
}

export function recentRecipes() {
  return request<{ results: RecipeDoc[] }>(`/recipes/recent`);
}

export function health() {
  return request<{ ok: boolean }>(`/health`);
}

/** 검색결과/저장문서 → 상세화면 라우트 파라미터 */
export function docRef(r: { type: "youtube" | "blog"; id: string; url: string }): { kind: "yt" | "url"; value: string } {
  if (r.type === "youtube") return { kind: "yt", value: r.id.replace(/^yt:/, "") };
  return { kind: "url", value: r.url };
}

export function formatSec(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

/** 폰이 긁어온 원문을 서버로 보내 Claude 정리만 요청 */
export function recipeFromContent(payload: Record<string, unknown>) {
  return request<RecipeDoc>(`/recipe/from-content`, { method: "POST", body: JSON.stringify(payload) });
}

/** 서버 캐시에 이미 정리된 결과가 있는지 확인 (없으면 예외) */
export function cachedRecipe(id: string) {
  return request<RecipeDoc>(`/recipe/cached/${encodeURIComponent(id)}`);
}
