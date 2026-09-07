import { useCallback, useEffect, useRef, useState } from "react";
import { cachedRecipe, recipeByUrl, recipeByYoutube, recipeFromContent } from "./api";
import type { RecipeDoc } from "./types";
import type { ExtractJob } from "../components/HiddenExtractor";
import type { ExtractResult } from "./inject";

export type Stage = "cache" | "extract" | "structure" | "fallback";

export const STAGE_LABEL: Record<Stage, string> = {
  cache: "저장된 레시피 확인 중…",
  extract: "원문을 읽는 중…",
  structure: "재료와 순서를 정리하는 중…",
  fallback: "서버에서 다시 시도하는 중…",
};

/** 폰이 페이지를 여는 데 걸리는 최대 시간 */
const EXTRACT_TIMEOUT_MS = 20000;

type Params = { id: string; url?: string };

/**
 * 레시피 한 건을 불러온다.
 *  1) 서버 캐시 확인 (이미 정리된 것이면 즉시)
 *  2) 폰의 WebView가 직접 원문을 읽음
 *  3) 읽은 원문만 서버로 보내 Claude가 정리
 *  4) 폰이 실패하면 서버가 직접 긁는 기존 경로로 대체
 */
export function useRecipe({ id, url }: Params) {
  const isYoutube = id !== "url";
  const targetUrl = isYoutube ? `https://www.youtube.com/watch?v=${id}` : (url ?? "");
  const docId = isYoutube ? `yt:${id}` : `url:${targetUrl}`;

  const [doc, setDoc] = useState<RecipeDoc | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage | null>("cache");
  const [job, setJob] = useState<ExtractJob | null>(null);
  const refreshing = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settled = useRef(false);

  const clearTimer = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  /** 폰이 못 읽었을 때 쓰는 기존 경로 */
  const serverFallback = useCallback(async () => {
    setStage("fallback");
    try {
      const d = isYoutube
        ? await recipeByYoutube(id, refreshing.current)
        : await recipeByUrl(targetUrl, refreshing.current);
      setDoc(d);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "레시피를 불러오지 못했습니다");
    } finally {
      setStage(null);
      setJob(null);
    }
  }, [id, isYoutube, targetUrl]);

  const start = useCallback(
    async (refresh: boolean) => {
      refreshing.current = refresh;
      settled.current = false;
      setError(null);
      setDoc(null);
      setStage("cache");
      setJob(null);
      clearTimer();

      if (!targetUrl) {
        setError("주소가 없습니다");
        setStage(null);
        return;
      }

      if (!refresh) {
        try {
          setDoc(await cachedRecipe(docId));
          setStage(null);
          return;
        } catch {
          // 캐시 없음 → 아래에서 직접 읽는다
        }
      }

      setStage("extract");
      setJob({ kind: isYoutube ? "youtube" : "blog", url: targetUrl });
      timer.current = setTimeout(() => {
        if (settled.current) return;
        settled.current = true;
        setJob(null);
        void serverFallback();
      }, EXTRACT_TIMEOUT_MS);
    },
    [docId, isYoutube, targetUrl, serverFallback],
  );

  useEffect(() => {
    void start(false);
    return clearTimer;
  }, [start]);

  /** WebView가 원문을 읽어 돌려줬을 때 */
  const onExtracted = useCallback(
    async (r: ExtractResult) => {
      if (settled.current) return;
      settled.current = true;
      clearTimer();
      setJob(null);

      if (!r.ok) {
        await serverFallback();
        return;
      }

      setStage("structure");
      try {
        const d = await recipeFromContent({
          sourceType: isYoutube ? "youtube" : "blog",
          url: targetUrl,
          videoId: isYoutube ? (r.videoId ?? id) : null,
          title: r.title,
          author: r.author,
          siteName: r.siteName,
          thumbnail: r.thumbnail,
          durationSec: r.durationSec,
          description: r.description,
          chapters: r.chapters,
          transcript: r.transcript,
          refresh: refreshing.current,
        });
        setDoc(d);
        setStage(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "정리에 실패했습니다");
        setStage(null);
      }
    },
    [id, isYoutube, targetUrl, serverFallback],
  );

  return { doc, error, stage, job, onExtracted, reload: start };
}
