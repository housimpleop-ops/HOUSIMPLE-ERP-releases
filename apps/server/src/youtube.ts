import type { SearchResult } from "./schema.js";
import { decodeHtmlEntities, extractChapters, parseIsoDuration, HttpError } from "./util.js";

const API = "https://www.googleapis.com/youtube/v3";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

function apiKey(): string {
  const k = process.env.YOUTUBE_API_KEY;
  if (!k) throw new HttpError(500, "YOUTUBE_API_KEY 환경변수가 없습니다");
  return k;
}

export type VideoDetails = {
  videoId: string;
  title: string;
  description: string;
  channelTitle: string;
  thumbnail: string;
  durationSec: number | null;
};

/** YouTube Data API 검색. search.list = 100 quota, videos.list = 1 quota */
export async function searchYoutube(query: string, max = 10): Promise<SearchResult[]> {
  const q = /레시피|만들기|요리|recipe/i.test(query) ? query : `${query} 레시피`;
  const params = new URLSearchParams({
    part: "snippet",
    type: "video",
    q,
    maxResults: String(max),
    relevanceLanguage: "ko",
    regionCode: "KR",
    videoDuration: "medium", // 4~20분: 요리 영상 대부분. 쇼츠·장편 제외
    key: apiKey(),
  });
  const res = await fetch(`${API}/search?${params}`);
  if (!res.ok) throw new HttpError(502, `YouTube search 실패: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as {
    items: { id: { videoId: string }; snippet: { title: string; description: string; channelTitle: string; thumbnails: Record<string, { url: string }> } }[];
  };
  const ids = data.items.map((i) => i.id.videoId);
  const durations = await fetchDurations(ids);
  return data.items.map((i) => ({
    id: i.id.videoId,
    type: "youtube" as const,
    title: decodeHtmlEntities(i.snippet.title),
    description: i.snippet.description,
    thumbnail: i.snippet.thumbnails.high?.url ?? i.snippet.thumbnails.default?.url ?? "",
    author: i.snippet.channelTitle,
    url: `https://www.youtube.com/watch?v=${i.id.videoId}`,
    durationSec: durations.get(i.id.videoId) ?? null,
  }));
}

async function fetchDurations(ids: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (ids.length === 0) return out;
  const params = new URLSearchParams({ part: "contentDetails", id: ids.join(","), key: apiKey() });
  const res = await fetch(`${API}/videos?${params}`);
  if (!res.ok) return out;
  const data = (await res.json()) as { items: { id: string; contentDetails: { duration: string } }[] };
  for (const it of data.items) {
    const d = parseIsoDuration(it.contentDetails.duration);
    if (d !== null) out.set(it.id, d);
  }
  return out;
}

export async function getVideoDetails(videoId: string): Promise<VideoDetails> {
  const params = new URLSearchParams({ part: "snippet,contentDetails", id: videoId, key: apiKey() });
  const res = await fetch(`${API}/videos?${params}`);
  if (!res.ok) throw new HttpError(502, `YouTube videos 실패: ${res.status}`);
  const data = (await res.json()) as {
    items: { id: string; snippet: { title: string; description: string; channelTitle: string; thumbnails: Record<string, { url: string }> }; contentDetails: { duration: string } }[];
  };
  const v = data.items[0];
  if (!v) throw new HttpError(404, "영상을 찾을 수 없습니다");
  return {
    videoId,
    title: decodeHtmlEntities(v.snippet.title),
    description: v.snippet.description,
    channelTitle: v.snippet.channelTitle,
    thumbnail: v.snippet.thumbnails.maxres?.url ?? v.snippet.thumbnails.high?.url ?? "",
    durationSec: parseIsoDuration(v.contentDetails.duration),
  };
}

export type TranscriptLine = { start: number; dur: number; text: string };

/**
 * 자막 가져오기 (비공식 — watch 페이지의 captionTracks를 읽어 timedtext를 받아온다).
 * 한국어 자막 > 한국어 자동생성 > 아무 자막 순으로 선택. 실패하면 [] 반환 (에러 아님).
 * 주의: 데이터센터 IP에서는 유튜브가 차단할 수 있음. 그 경우 설명란 챕터로 대체.
 */
export async function fetchTranscript(videoId: string): Promise<TranscriptLine[]> {
  try {
    const page = await fetch(`https://www.youtube.com/watch?v=${videoId}&hl=ko`, {
      headers: { "User-Agent": UA, "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.5" },
    });
    const html = await page.text();
    const m = html.match(/"captionTracks":(\[.*?\])/);
    if (!m) return [];
    const tracks = JSON.parse(m[1]) as { baseUrl: string; languageCode: string; kind?: string }[];
    const pick =
      tracks.find((t) => t.languageCode.startsWith("ko") && t.kind !== "asr") ??
      tracks.find((t) => t.languageCode.startsWith("ko")) ??
      tracks[0];
    if (!pick) return [];
    const url = pick.baseUrl.replace(/\\u0026/g, "&");
    const xml = await (await fetch(url, { headers: { "User-Agent": UA } })).text();
    return parseTimedText(xml);
  } catch {
    return [];
  }
}

export function parseTimedText(xml: string): TranscriptLine[] {
  const out: TranscriptLine[] = [];
  const re = /<text start="([\d.]+)"(?: dur="([\d.]+)")?[^>]*>([\s\S]*?)<\/text>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const text = decodeHtmlEntities(m[3].replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
    if (!text) continue;
    out.push({ start: Number(m[1]), dur: Number(m[2] ?? 0), text });
  }
  return out;
}

/** LLM에 넣기 좋은 형태: "[0:35] 양파를 썰어주세요" 줄 단위. 너무 촘촘한 자막은 ~15초 단위로 묶는다 */
export function transcriptToText(lines: TranscriptLine[], bucketSec = 15): string {
  if (lines.length === 0) return "";
  const buckets: { start: number; parts: string[] }[] = [];
  for (const l of lines) {
    const last = buckets[buckets.length - 1];
    if (last && l.start - last.start < bucketSec) last.parts.push(l.text);
    else buckets.push({ start: l.start, parts: [l.text] });
  }
  return buckets.map((b) => `[${fmt(b.start)}] ${b.parts.join(" ")}`).join("\n");
}

function fmt(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export { extractChapters };
