import { z } from "zod";

/** 레시피 표준 스키마 — 유튜브/블로그 어디서 왔든 이 형태로 통일 */
export const IngredientSchema = z.object({
  name: z.string().describe("재료명 (예: 양파)"),
  amount: z.string().describe("분량 (예: 1/2개, 2큰술). 모르면 빈 문자열"),
  note: z.string().describe("손질법·대체재 등 부가 메모. 없으면 빈 문자열"),
  group: z.string().describe("재료 그룹 (주재료/양념/고명 등). 없으면 빈 문자열"),
});

export const StepSchema = z.object({
  order: z.number().int().describe("1부터 시작하는 순서"),
  text: z.string().describe("한 단계의 조리 설명. 한국어, 1~3문장"),
  startSec: z.number().nullable().describe("영상에서 이 단계가 시작되는 초. 영상이 아니거나 모르면 null"),
  endSec: z.number().nullable().describe("영상에서 이 단계가 끝나는 초. 모르면 null"),
  ingredientsUsed: z.array(z.string()).describe("이 단계에서 사용하는 재료명 목록"),
  timerSec: z.number().nullable().describe("이 단계에 타이머가 필요하면 초 단위 (예: 5분 끓이기 → 300). 없으면 null"),
});

export const RecipeSchema = z.object({
  title: z.string().describe("요리 이름"),
  summary: z.string().describe("한 줄 소개"),
  servings: z.string().describe("몇 인분. 모르면 빈 문자열"),
  totalTimeMinutes: z.number().nullable().describe("총 조리 시간(분). 모르면 null"),
  difficulty: z.enum(["easy", "medium", "hard", "unknown"]),
  ingredients: z.array(IngredientSchema),
  steps: z.array(StepSchema),
  tips: z.array(z.string()).describe("팁·주의사항"),
  tags: z.array(z.string()).describe("한식/찌개/자취요리 같은 태그 3~6개"),
  isRecipe: z.boolean().describe("원문이 실제 요리 레시피이면 true. 먹방·리뷰 등이면 false"),
});

export type Recipe = z.infer<typeof RecipeSchema>;
export type Ingredient = z.infer<typeof IngredientSchema>;
export type Step = z.infer<typeof StepSchema>;

export const SourceSchema = z.object({
  type: z.enum(["youtube", "blog"]),
  url: z.string(),
  videoId: z.string().nullable(),
  siteName: z.string(),
  author: z.string(),
  thumbnail: z.string(),
  durationSec: z.number().nullable(),
  hasTranscript: z.boolean(),
});
export type Source = z.infer<typeof SourceSchema>;

/** 클라이언트에 내려주는 최종 형태 */
export const RecipeDocSchema = z.object({
  id: z.string(),
  source: SourceSchema,
  recipe: RecipeSchema,
  createdAt: z.string(),
});
export type RecipeDoc = z.infer<typeof RecipeDocSchema>;

/** 검색 결과 항목 */
export type SearchResult = {
  id: string; // youtube: videoId, blog: url
  type: "youtube" | "blog";
  title: string;
  thumbnail: string;
  author: string;
  url: string;
  durationSec: number | null;
  description: string;
};

/**
 * 폰이 직접 긁어온 원문을 서버로 보낼 때의 형태.
 * 서버는 이 내용을 Claude로 구조화만 한다 (외부 사이트에 접속하지 않음).
 */
export const FromContentSchema = z.object({
  sourceType: z.enum(["youtube", "blog"]),
  url: z.string().url(),
  videoId: z.string().nullable().default(null),
  title: z.string().default(""),
  author: z.string().default(""),
  siteName: z.string().default(""),
  thumbnail: z.string().default(""),
  durationSec: z.number().nullable().default(null),
  /** 유튜브 설명란 또는 블로그 본문 텍스트 */
  description: z.string().default(""),
  /** 설명란 챕터 (초, 라벨) */
  chapters: z.array(z.object({ sec: z.number(), label: z.string() })).default([]),
  /** 자막 줄 (초, 텍스트). 블로그면 빈 배열 */
  transcript: z.array(z.object({ start: z.number(), text: z.string() })).default([]),
  refresh: z.boolean().default(false),
});
export type FromContent = z.infer<typeof FromContentSchema>;
