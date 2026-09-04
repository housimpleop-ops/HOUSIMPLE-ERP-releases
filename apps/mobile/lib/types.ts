// 서버 apps/server/src/schema.ts 와 동일한 형태
export type Ingredient = { name: string; amount: string; note: string; group: string };
export type Step = {
  order: number;
  text: string;
  startSec: number | null;
  endSec: number | null;
  ingredientsUsed: string[];
  timerSec: number | null;
};
export type Recipe = {
  title: string;
  summary: string;
  servings: string;
  totalTimeMinutes: number | null;
  difficulty: "easy" | "medium" | "hard" | "unknown";
  ingredients: Ingredient[];
  steps: Step[];
  tips: string[];
  tags: string[];
  isRecipe: boolean;
};
export type Source = {
  type: "youtube" | "blog";
  url: string;
  videoId: string | null;
  siteName: string;
  author: string;
  thumbnail: string;
  durationSec: number | null;
  hasTranscript: boolean;
};
export type RecipeDoc = { id: string; source: Source; recipe: Recipe; createdAt: string; cached?: boolean };
export type SearchResult = {
  id: string;
  type: "youtube" | "blog";
  title: string;
  thumbnail: string;
  author: string;
  url: string;
  durationSec: number | null;
  description: string;
};
