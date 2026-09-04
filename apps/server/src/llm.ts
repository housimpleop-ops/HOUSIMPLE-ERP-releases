import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { RecipeSchema, type Recipe } from "./schema.js";
import { HttpError } from "./util.js";

const MODEL = process.env.CLAUDE_MODEL ?? "claude-opus-5";

let _client: Anthropic | null = null;
function client(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) throw new HttpError(500, "ANTHROPIC_API_KEY 환경변수가 없습니다");
  return (_client ??= new Anthropic());
}

// 시스템 프롬프트는 고정 문자열(캐시 프리픽스). 가변 내용은 user 메시지에만 넣는다.
const SYSTEM = `당신은 한국 요리 레시피를 구조화하는 전문가입니다.
입력으로 유튜브 영상의 제목·설명·자막(타임스탬프 포함) 또는 블로그 본문이 주어집니다.
이를 재료 목록과 조리 순서로 정리합니다.

원칙:
- 원문에 있는 내용만 사용합니다. 없는 재료·분량·시간을 지어내지 않습니다. 모르면 빈 문자열/null.
- 재료 분량은 원문 표기 그대로 (예: "2큰술", "1/2개", "한 줌").
- 조리 순서는 실제로 손이 가는 동작 단위로 나눕니다. 보통 5~15단계.
- 영상 자막이 있으면 각 단계의 startSec은 그 동작을 설명하기 시작하는 자막의 타임스탬프로 잡습니다.
  endSec은 다음 단계의 startSec으로 둡니다(마지막 단계는 null 가능).
  인트로·먹방·마무리 인사 구간은 단계에 넣지 않습니다.
- 설명란에 챕터 타임스탬프(0:35 재료 손질 ...)가 있으면 그것을 우선 신뢰합니다.
- 자막도 챕터도 없으면 startSec/endSec은 모두 null.
- 블로그 원문이면 startSec/endSec은 항상 null.
- 존댓말 서술형("~합니다")이 아닌 간결한 지시형("~한다")으로 씁니다.
- 원문이 레시피가 아니면(먹방, 리뷰, 광고 등) isRecipe=false 로 두고 나머지는 최대한 비웁니다.`;

export type LlmInput = {
  sourceType: "youtube" | "blog";
  title: string;
  author: string;
  description: string;
  chapters: { sec: number; label: string }[];
  transcript: string; // "[0:35] ..." 줄 단위. 없으면 ""
  durationSec: number | null;
};

export async function structureRecipe(input: LlmInput): Promise<{ recipe: Recipe; usage: Anthropic.Usage }> {
  const parts: string[] = [];
  parts.push(`[출처 유형] ${input.sourceType === "youtube" ? "유튜브 영상" : "블로그/웹페이지"}`);
  parts.push(`[제목] ${input.title}`);
  if (input.author) parts.push(`[작성자/채널] ${input.author}`);
  if (input.durationSec) parts.push(`[영상 길이(초)] ${input.durationSec}`);
  if (input.chapters.length > 0) {
    parts.push(`[설명란 챕터]\n${input.chapters.map((c) => `${c.sec}s ${c.label}`).join("\n")}`);
  }
  parts.push(`[${input.sourceType === "youtube" ? "영상 설명란" : "본문"}]\n${input.description.slice(0, 20000)}`);
  if (input.transcript) parts.push(`[자막 (타임스탬프 = 분:초)]\n${input.transcript.slice(0, 60000)}`);
  else if (input.sourceType === "youtube") parts.push(`[자막] 없음 — 설명란과 챕터만으로 정리하고, 시간 정보가 없으면 startSec/endSec은 null`);

  const response = await client().messages.parse({
    model: MODEL,
    max_tokens: 16000,
    system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: parts.join("\n\n") }],
    output_config: { format: zodOutputFormat(RecipeSchema), effort: "medium" },
  });

  if (response.stop_reason === "refusal") throw new HttpError(422, "모델이 이 콘텐츠 처리를 거부했습니다");
  if (!response.parsed_output) throw new HttpError(502, "레시피 구조화 결과를 해석하지 못했습니다");
  return { recipe: response.parsed_output, usage: response.usage };
}
