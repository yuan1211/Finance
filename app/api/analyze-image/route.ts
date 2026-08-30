import { NextResponse } from "next/server";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { BASE_PERSONA, FALLBACK_BETAS, MODEL, getClient } from "@/lib/anthropic";
import { keywordDb } from "@/lib/mock-db";
import { buildScoreBreakdown } from "@/lib/score-breakdown";
import { filterHallucinatedSignals } from "@/lib/verify-signals";
import type { RiskAnalysis } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
/** 요청 본문 한도(32MB)에 여유를 두고 base64 팽창(약 1.37배)까지 감안한 값 */
const MAX_BYTES = 5 * 1024 * 1024;

const ImageAnalysisSchema = z.object({
  extractedText: z
    .string()
    .describe("이미지에서 읽어낸 문자·메신저 대화 원문. 발신번호와 링크까지 그대로 옮길 것"),
  senderInfo: z.string().describe("이미지에서 확인되는 발신번호나 발신자명. 없으면 '확인 불가'"),
  riskLevel: z.enum(["낮음", "중간", "높음"]),
  riskScore: z.number().int().min(0).max(100),
  scamType: z.enum([
    "기관 사칭",
    "가족·지인 사칭",
    "대출 사기",
    "투자·리딩방 사기",
    "택배·결제 스미싱",
    "로맨스 스캠",
    "판단 보류",
  ]),
  detectedSignals: z
    .array(
      z.object({
        keyword: z.string().describe("이미지에서 읽어낸 원문에 실제로 등장한 위험 문구"),
        category: z.string(),
        explanation: z.string(),
      }),
    )
    .max(8),
  reasoning: z.string().describe("종합 판단 근거 2~4문장"),
  immediateAdvice: z.array(z.string()).max(4),
  calmMessage: z.string().describe("사용자를 진정시키는 첫 메시지. 2문장 이내"),
});

const KEYWORD_GUIDE = keywordDb.categories
  .map((c) => `- ${c.category}: ${c.keywords.slice(0, 8).join(", ")}`)
  .join("\n");

const SYSTEM_PROMPT = `${BASE_PERSONA}

[이번 작업]
사용자가 받은 문자·메신저 화면을 캡처한 이미지를 받습니다.
먼저 화면에 보이는 대화 내용을 그대로 읽어 옮긴 뒤, 스미싱·보이스피싱 위험도를 판정합니다.

[참고 위험 발화 패턴 사전]
${KEYWORD_GUIDE}

[읽기 규칙]
- extractedText에는 화면에 보이는 문구를 있는 그대로 옮깁니다. 요약하거나 다듬지 마세요.
- URL, 전화번호, 금액은 특히 정확하게 옮깁니다. 한 글자 차이가 판단을 바꿉니다.
- 흐릿해서 확신할 수 없는 부분은 [판독 불가]로 표시하고 추측해서 채우지 마세요.
- 여러 말풍선이 있으면 위에서 아래 순서로, 보낸 사람이 구분되면 함께 표기합니다.

[판정 기준]
- 높음(60~100): 출처 불명 링크 + 결제·택배·미납 유도, 앱(apk) 설치 요구, 금전·개인정보 요구,
  가족 사칭 정황이 확인되는 경우.
- 중간(30~59): 의심 신호는 있으나 링크나 요구가 불명확한 경우.
- 낮음(0~29): 공식 기관·기업의 통상 안내로 보이는 경우.

[반드시 지킬 것]
- detectedSignals의 keyword는 반드시 extractedText에 실제로 등장한 표현이어야 합니다.
- 이미지가 문자·메신저 화면이 아니면 riskLevel을 '낮음', scamType을 '판단 보류'로 두고
  reasoning에 무엇이 보이는지 적으세요. 억지로 사기라고 판정하지 마세요.
- 사용자의 개인정보(주민번호, 카드번호 등)가 화면에 보이더라도 extractedText에 옮기지 말고
  [개인정보 생략]으로 대체하세요.`;

export async function POST(req: Request) {
  let body: { imageBase64?: string; mediaType?: string; callerNumber?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "잘못된 요청 형식입니다." }, { status: 400 });
  }

  const { imageBase64, mediaType } = body;
  if (!imageBase64 || !mediaType) {
    return NextResponse.json({ error: "이미지를 찾을 수 없습니다." }, { status: 400 });
  }
  if (!ALLOWED_TYPES.includes(mediaType as (typeof ALLOWED_TYPES)[number])) {
    return NextResponse.json(
      { error: "JPG, PNG, GIF, WebP 이미지만 분석할 수 있습니다." },
      { status: 400 },
    );
  }
  // base64 문자열 길이로 원본 바이트 수를 역산한다
  if ((imageBase64.length * 3) / 4 > MAX_BYTES) {
    return NextResponse.json({ error: "이미지 용량은 5MB 이하여야 합니다." }, { status: 413 });
  }

  const client = getClient();
  if (!client) {
    // 이미지 판독에는 실제 모델이 필요하다. 룰 기반으로 흉내 낼 수 있는 부분이 아니므로
    // 텍스트 붙여넣기로 안내하는 편이 정직하다.
    return NextResponse.json(
      {
        error:
          "이미지 분석은 Claude API 키가 설정되어 있어야 동작합니다. 문자 내용을 직접 붙여넣어 주시면 같은 분석을 받으실 수 있습니다.",
        needsApiKey: true,
      },
      { status: 503 },
    );
  }

  try {
    const response = await client.beta.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      betas: [...FALLBACK_BETAS],
      fallbacks: "default",
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      output_config: { effort: "medium", format: zodOutputFormat(ImageAnalysisSchema) },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mediaType as "image/png", data: imageBase64 },
            },
            {
              type: "text",
              text: `이 캡처 화면을 읽고 분석해 주세요.
[사용자가 입력한 발신번호] ${body.callerNumber?.trim() || "없음"}`,
            },
          ],
        },
      ],
    });

    if (response.stop_reason === "refusal" || !response.parsed_output) {
      return NextResponse.json(
        { error: "이미지를 분석하지 못했습니다. 문자 내용을 직접 붙여넣어 주세요." },
        { status: 502 },
      );
    }

    const parsed = response.parsed_output;

    // 이미지에서 읽어낸 원문에 실제로 없는 신호는 버린다 (텍스트 경로와 동일한 방어선)
    const { kept, dropped } = filterHallucinatedSignals(parsed.detectedSignals ?? [], [
      parsed.extractedText,
      parsed.senderInfo,
    ]);
    if (dropped.length > 0) {
      console.warn("[analyze-image] 원문에 없는 신호를 폐기했습니다:", dropped);
    }

    const analysis: RiskAnalysis = {
      riskLevel: parsed.riskLevel,
      riskScore: parsed.riskScore,
      scamType: parsed.scamType,
      detectedSignals: kept,
      reasoning: parsed.reasoning,
      immediateAdvice: parsed.immediateAdvice ?? [],
      calmMessage: parsed.calmMessage,
      scoreBreakdown: buildScoreBreakdown(parsed.extractedText, body.callerNumber),
      engine: "claude",
    };

    return NextResponse.json({
      analysis,
      extractedText: parsed.extractedText,
      senderInfo: parsed.senderInfo,
    });
  } catch (err) {
    console.error("[analyze-image] 이미지 분석 실패:", err);
    return NextResponse.json(
      { error: "이미지 분석 중 오류가 발생했습니다. 문자 내용을 직접 붙여넣어 주세요." },
      { status: 500 },
    );
  }
}
