import { NextResponse } from "next/server";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { BASE_PERSONA, FALLBACK_BETAS, MODEL, getClient } from "@/lib/anthropic";
import {
  analyzeLiveWithRules,
  clampAgainstPrevious,
  clampStage,
  levelFromScore,
  nextMoveOf,
  trendOf,
} from "@/lib/live-analyzer";
import { keywordDb, lookupReportedPhone, lookupReportedUrls } from "@/lib/mock-db";
import { buildScoreBreakdown } from "@/lib/score-breakdown";
import { filterHallucinatedSignals } from "@/lib/verify-signals";
import type { LiveAnalyzeRequest, LiveRiskUpdate } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 30;

const LiveSchema = z.object({
  riskScore: z.number().int().min(0).max(100).describe("현재까지 누적된 통화 전체의 위험 점수"),
  trend: z.enum(["상승", "유지", "하락"]).describe("직전 위험도 대비 변화 방향"),
  newSignals: z
    .array(
      z.object({
        keyword: z.string().describe("이번 구간 발화에 실제로 등장한 위험 문구"),
        category: z.string().describe("위험 신호 분류명"),
        explanation: z.string().describe("왜 위험한지 한 문장"),
      }),
    )
    .max(4)
    .describe("이번 구간에서 '새로' 감지된 신호만. 이미 보고된 신호는 다시 넣지 말 것"),
  shouldIntervene: z.boolean().describe("지금 통화를 멈추고 역검증에 들어가야 하는지"),
  reason: z.string().describe("위험도가 이렇게 움직인 이유. 1~2문장"),
  liveMessage: z.string().describe("사용자 화면에 띄울 지시 문구. 1문장, 40자 내외"),
  scamType: z.enum([
    "기관 사칭",
    "가족·지인 사칭",
    "대출 사기",
    "투자·리딩방 사기",
    "택배·결제 스미싱",
    "로맨스 스캠",
    "판단 보류",
  ]),
  scamStage: z
    .enum(["미확인", "접근", "신뢰구축", "고립", "압박", "편취"])
    .describe("지금 통화가 보이스피싱 시나리오의 어느 단계까지 왔는지"),
  predictedNextMove: z
    .string()
    .describe("이 단계 다음에 상대가 요구할 가능성이 높은 것. 1문장, 예고 형태로"),
  counterQuestions: z
    .array(z.string())
    .max(3)
    .describe("사용자가 상대에게 그대로 소리 내어 읽을 검증 질문. 위험도가 낮으면 빈 배열"),
});

const KEYWORD_GUIDE = keywordDb.categories
  .map((c) => `- ${c.category}: ${c.keywords.slice(0, 8).join(", ")}`)
  .join("\n");

/** 세션 내내 동일하므로 캐시 대상으로 삼아 실시간 호출 비용·지연을 낮춘다 */
const SYSTEM_PROMPT = `${BASE_PERSONA}

[이번 작업 — 실시간 통화 모니터링]
사용자가 통화를 스피커폰으로 켜 둔 상태이고, 음성 인식으로 받아 적은 통화 내용이 몇 초 간격으로 계속 들어옵니다.
당신은 매 호출마다 "누적 트랜스크립트 전체"와 "직전 위험도"를 받아, 지금 이 순간의 위험도를 갱신합니다.

[참고 위험 발화 패턴 사전]
${KEYWORD_GUIDE}

[점수 기준]
- 60~100(높음): 송금·현금인출 유도, 원격제어 앱 설치 유도, 기관 사칭과 통제 발화의 결합, 신고 이력이 확인된 번호.
- 30~59(중간): 위험 신호는 있으나 금전 요구가 아직 명확하지 않은 단계.
- 0~29(낮음): 알려진 사기 패턴이 확인되지 않는 단계.

[시나리오 단계]
보이스피싱 조직은 정해진 대본을 따라 움직입니다. 지금 통화가 어디까지 왔는지 판정하세요.
1. 접근 — 신분·소속을 밝히며 말을 붙이는 단계.
2. 신뢰구축 — 사건번호, 피해 상황, 명의도용 같은 이야기로 자신을 믿게 만드는 단계.
3. 고립 — "아무에게도 말하지 마라", "전화를 끊지 마라"로 확인 통로를 끊는 단계. 가장 중요한 전환점입니다.
4. 압박 — 시간·불이익으로 몰아붙이며 앱 설치, 개인정보, 인증번호를 요구하는 단계.
5. 편취 — 실제로 이체·현금 인출·상품권 구매를 요구하는 단계.
- 단계는 뒤로 돌아가지 않습니다. [직전 단계]보다 앞선 단계를 고르지 마세요.
- 여러 단계의 신호가 섞여 있으면 가장 진행된 단계를 고릅니다.
- predictedNextMove는 이 단계 다음에 통상 무엇이 오는지를 사용자에게 미리 알려주는 한 문장입니다.
  "다음은 ~를 요구할 가능성이 높습니다" 형태로 쓰고, 이미 나온 요구를 다시 예고하지 마세요.

[역질문 코칭 — counterQuestions]
사용자가 상대에게 그대로 소리 내어 읽을 수 있는 검증 질문을 최대 3개 만듭니다.
- 진짜 기관·가족이라면 곧바로 답할 수 있지만, 사칭범은 답하지 못하는 질문이어야 합니다.
  (예: 소속 부서와 직통번호, 사건번호 재확인, 영상통화 요청, 앱의 정확한 이름, 계좌 예금주 이름)
- 통화 중에 그대로 읽을 수 있도록 완결된 한 문장으로 씁니다. 25자~45자 정도가 적당합니다.
- 상대를 비난하거나 "당신 사기꾼이죠" 같은 자극적 표현은 쓰지 않습니다. 차분한 확인 요청으로 씁니다.
- 사용자의 개인정보를 되레 노출시키는 질문은 절대 만들지 마세요.
  (금지 예: "제 계좌번호가 1002-987-654321 맞나요?", "제 주민번호 뒷자리가 맞나요?")
- 이미 상대가 답한 내용을 다시 묻지 마세요. 지금 확인이 필요한 것만 묻습니다.
- 위험도가 '낮음'이고 통제·금전 요구가 전혀 없으면 빈 배열로 둡니다. 정상 통화 중에 상대를
  의심하게 만드는 것도 서비스의 실패입니다.

[비언어 신호 다루는 법]
마이크로 잰 말 빠르기·쉼 없음·음량 변화가 함께 들어올 수 있습니다.
- 이건 보조 근거입니다. 비언어 신호만으로 위험도를 올리지 마세요. 빠르게 말하는 정상 상담원도 많습니다.
- 다만 위험 발화가 이미 있는 상태에서 압박 패턴이 겹치면, reason에 그 사실을 한 문장으로 덧붙이세요.
  (예: "쉼 없이 몰아붙이는 말투가 함께 확인됩니다.")
- newSignals에는 넣지 마세요. newSignals의 keyword는 트랜스크립트에 등장한 표현만 담습니다.

[실시간 판단 규칙]
1. 점수는 통화 전체 누적 기준입니다. 이번 구간만 보고 매기지 마세요.
2. 이미 나온 위험 발화는 취소되지 않습니다. 따라서 점수는 웬만해선 내려가지 않습니다. 상대가 해명을 했다는 이유만으로 낮추지 마세요.
3. newSignals에는 "이번 구간에서 처음 등장한" 신호만 담습니다. [이미 보고한 신호] 목록에 있는 것은 넣지 마세요.
4. keyword는 반드시 트랜스크립트에 실제로 등장한 표현이어야 합니다. 지어내지 마세요.
5. 음성 인식 오탈자가 섞여 있을 수 있습니다. 명백한 오인식은 문맥으로 보정해서 판단하되, 근거가 약하면 점수를 올리지 마세요.
6. shouldIntervene은 지금 통화를 끊고 역검증에 들어가야 할 때만 true로 합니다. 위험도 '높음'이거나, '중간'인데 금전·앱설치·개인정보 요구가 새로 나온 경우입니다.
7. liveMessage는 통화 중에 곁눈질로 읽는 문구입니다. 한 문장, 짧고 분명하게. 위험도가 낮으면 "계속 듣고 있겠습니다" 같은 차분한 문구로 둡니다.`;

export async function POST(req: Request) {
  let body: LiveAnalyzeRequest;
  try {
    body = (await req.json()) as LiveAnalyzeRequest;
  } catch {
    return NextResponse.json({ error: "잘못된 요청 형식입니다." }, { status: 400 });
  }

  const transcript = (body?.transcript ?? "").trim();
  if (transcript.length < 4) {
    return NextResponse.json({ error: "분석할 통화 내용이 아직 충분하지 않습니다." }, { status: 400 });
  }

  const normalized: LiveAnalyzeRequest = {
    transcript,
    recentText: (body.recentText ?? "").trim(),
    previousLevel: body.previousLevel ?? null,
    previousScore: typeof body.previousScore === "number" ? body.previousScore : null,
    knownKeywords: Array.isArray(body.knownKeywords) ? body.knownKeywords.slice(0, 40) : [],
    previousStage: body.previousStage ?? null,
    nonverbal: Array.isArray(body.nonverbal) ? body.nonverbal.slice(0, 6) : undefined,
    callerNumber: body.callerNumber,
  };

  const client = getClient();
  if (!client) {
    return NextResponse.json(analyzeLiveWithRules(normalized));
  }

  try {
    const response = await client.beta.messages.parse({
      model: MODEL,
      max_tokens: 4000,
      betas: [...FALLBACK_BETAS],
      fallbacks: "default",
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      // 통화 중 실시간 갱신이라 지연이 곧 사용성이다. 추론 깊이보다 응답 속도를 택한다.
      output_config: { effort: "low", format: zodOutputFormat(LiveSchema) },
      messages: [
        {
          role: "user",
          content: `[발신번호] ${normalized.callerNumber?.trim() || "없음"}
[발신번호 신고 이력] ${describePhone(normalized.callerNumber)}
[본문 내 신고 도메인] ${describeUrls(transcript)}
[직전 위험도] ${normalized.previousLevel ?? "아직 없음"} / ${normalized.previousScore ?? "-"}점
[직전 단계] ${normalized.previousStage ?? "아직 없음"}
[비언어 신호] ${describeNonverbalBlock(normalized.nonverbal)}
[이미 보고한 신호] ${normalized.knownKeywords.length > 0 ? normalized.knownKeywords.join(", ") : "없음"}

[누적 트랜스크립트]
"""
${transcript}
"""

[직전 분석 이후 새로 들어온 부분]
"""
${normalized.recentText || "(없음)"}
"""`,
        },
      ],
    });

    if (response.stop_reason === "refusal" || !response.parsed_output) {
      return NextResponse.json(analyzeLiveWithRules(normalized));
    }

    const parsed = response.parsed_output;
    // 원문에 실제로 등장하지 않는 신호는 근거가 될 수 없으므로 여기서 버린다
    const { kept: verifiedSignals, dropped } = filterHallucinatedSignals(parsed.newSignals ?? [], [
      transcript,
      normalized.callerNumber,
    ]);
    if (dropped.length > 0) {
      console.warn("[live-analyze] 원문에 없는 신호를 폐기했습니다:", dropped);
    }

    // 점수는 서버에서 한 번 더 다듬는다: 급락 방지 + 레벨을 점수와 항상 일치시킨다
    const riskScore = clampAgainstPrevious(parsed.riskScore, normalized.previousScore);
    // 단계도 점수와 같은 이유로 되돌아가지 않게 고정한다
    const scamStage = clampStage(parsed.scamStage, normalized.previousStage);
    const result: LiveRiskUpdate = {
      riskScore,
      riskLevel: levelFromScore(riskScore),
      trend: trendOf(riskScore, normalized.previousScore),
      newSignals: verifiedSignals,
      shouldIntervene: parsed.shouldIntervene,
      reason: parsed.reason,
      liveMessage: parsed.liveMessage,
      scamType: parsed.scamType,
      scamStage,
      // 모델이 단계를 낮춰 잡아 되돌려진 경우, 예고 문구도 확정된 단계 기준으로 맞춘다
      predictedNextMove:
        scamStage === parsed.scamStage ? parsed.predictedNextMove : nextMoveOf(scamStage),
      counterQuestions: (parsed.counterQuestions ?? []).slice(0, 3),
      // LLM이 점수를 매겼더라도 분해는 규칙 기반으로 따로 계산해 함께 보여 준다
      scoreBreakdown: buildScoreBreakdown(transcript, normalized.callerNumber),
      engine: "claude",
    };
    return NextResponse.json(result);
  } catch (err) {
    console.error("[live-analyze] LLM 호출 실패, 룰 기반 폴백으로 전환:", err);
    return NextResponse.json(analyzeLiveWithRules(normalized));
  }
}

function describePhone(raw?: string): string {
  if (!raw?.trim()) return "발신번호 미입력";
  const hit = lookupReportedPhone(raw);
  return hit ? `있음 (${hit.reports}건, ${hit.type}, ${hit.memo})` : "조회됨, 등록된 신고 이력 없음";
}

function describeNonverbalBlock(lines?: string[]): string {
  if (!lines || lines.length === 0) return "측정 없음 (마이크 미사용 또는 표본 부족)";
  return `\n  - ${lines.join("\n  - ")}`;
}

function describeUrls(text: string): string {
  const hits = lookupReportedUrls(text);
  return hits.length > 0 ? hits.map((u) => `${u.domain}(${u.reports}건)`).join(", ") : "없음";
}
