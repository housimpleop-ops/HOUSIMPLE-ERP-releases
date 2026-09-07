/** "1:23" / "01:02:03" / "1분 20초" 같은 표기를 초로 변환 */
export function parseTimestamp(s: string): number | null {
  const m = s.trim().match(/^(?:(\d{1,2}):)?(\d{1,2}):(\d{2})$/);
  if (m) {
    const h = m[1] ? Number(m[1]) : 0;
    return h * 3600 + Number(m[2]) * 60 + Number(m[3]);
  }
  const k = s.match(/(?:(\d+)\s*시간)?\s*(?:(\d+)\s*분)?\s*(?:(\d+)\s*초)?/);
  if (k && (k[1] || k[2] || k[3])) {
    return Number(k[1] ?? 0) * 3600 + Number(k[2] ?? 0) * 60 + Number(k[3] ?? 0);
  }
  return null;
}

/** 영상 설명란의 "0:35 재료 손질" 같은 챕터 목록 추출 */
export function extractChapters(description: string): { sec: number; label: string }[] {
  const out: { sec: number; label: string }[] = [];
  for (const line of description.split(/\r?\n/)) {
    const m = line.match(/(?:^|\s|\[|\()((?:\d{1,2}:)?\d{1,2}:\d{2})(?:\]|\))?\s*[-–:|~]?\s*(.+)$/);
    if (!m) continue;
    const sec = parseTimestamp(m[1]);
    if (sec === null) continue;
    out.push({ sec, label: m[2].trim() });
  }
  return out.sort((a, b) => a.sec - b.sec);
}

/** ISO 8601 duration (PT1H2M3S) → 초 */
export function parseIsoDuration(iso: string): number | null {
  const m = iso.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!m) return null;
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}

export function extractYoutubeId(url: string): string | null {
  const patterns = [
    /youtu\.be\/([\w-]{11})/,
    /[?&]v=([\w-]{11})/,
    /youtube\.com\/(?:shorts|embed|live)\/([\w-]{11})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  if (/^[\w-]{11}$/.test(url)) return url;
  return null;
}

export function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
}

export function formatSec(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/**
 * 제한 시간이 걸린 fetch.
 * 외부 사이트가 응답하지 않을 때 요청 전체가 매달리는 것을 막는다.
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = 12000,
): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (e) {
    if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")) {
      throw new HttpError(504, `응답 시간 초과 (${new URL(url).hostname})`);
    }
    throw new HttpError(502, `연결 실패 (${new URL(url).hostname})`);
  }
}
