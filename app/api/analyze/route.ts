import { NextResponse } from "next/server";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { BASE_PERSONA, FALLBACK_BETAS, MODEL, getClient } from "@/lib/anthropic";
import { analyzeWithRules } from "@/lib/fallback-analyzer";
import {
  findOrganization,
  keywordDb,
  lookupReportedAccount,
  lookupReportedPhone,
  lookupReportedUrls,
  matchesOfficialNumber,
} from "@/lib/mock-db";
import { buildScoreBreakdown } from "@/lib/score-breakdown";
import { filterHallucinatedSignals } from "@/lib/verify-signals";
import type { RiskAnalysis, SituationInput } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const AnalysisSchema = z.object({
  riskLevel: z.enum(["낮음", "중간", "높음"]).describe("종합 위험도"),
  riskScore: z.number().int().min(0).max(100).describe("0~100 위험 점수"),
  scamType: z
    .enum([
      "기관 사칭",
      "가족·지인 사칭",
      "대출 사기",
      "투자·리딩방 사기",
      "택배·결제 스미싱",
      "로맨스 스캠",
      "판단 보류",
    ])
    .describe("의심되는 사기 유형. 단정하기 어려우면 '판단 보류'"),
  detectedSignals: z
    .array(
      z.object({
        keyword: z.string().describe("입력 원문에 실제로 등장한 위험 문구"),
        category: z.string().describe("위험 신호 분류명"),
        explanation: z.string().describe("왜 위험한지 한 문장 설명"),
      }),
    )
    .max(8)
    .describe("판단 근거가 된 위험 신호 목록. 원문에 없는 문구를 지어내지 말 것"),
  reasoning: z.string().describe("종합 판단 근거를 2~4문장으로. 단정 표현 대신 신호 중심 서술"),
  immediateAdvice: z
    .array(z.string())
    .max(4)
    .describe("지금 당장 멈춰야 할 행동과 해야 할 행동. 각 항목 한 문장"),
  calmMessage: z.string().describe("사용자를 진정시키는 첫 메시지. 2문장 이내"),
});

function buildContext(input: SituationInput) {
  const phoneHit = lookupReportedPhone(input.callerNumber);
  const accountHit = lookupReportedAccount(input.accountNumber);
  const urlHits = lookupReportedUrls(input.content);
  const org = findOrganization(`${input.claimedOrg ?? ""} ${input.content}`);
  const officialMatch = org ? matchesOfficialNumber(org, input.callerNumber) : false;

  const lines: string[] = [];
  lines.push(
    phoneHit
      ? `- 발신번호 신고 이력: 있음 (최근 ${phoneHit.reports}건, 유형: ${phoneHit.type}, 최종 ${phoneHit.lastReportedAt}, 메모: ${phoneHit.memo})`
      : input.callerNumber
        ? "- 발신번호 신고 이력: 조회됨, 등록된 신고 이력 없음"
        : "- 발신번호: 입력되지 않음",
  );
  lines.push(
    accountHit
      ? `- 계좌 신고 이력: 있음 (${accountHit.bank}, ${accountHit.reports}건, 메모: ${accountHit.memo})`
      : input.accountNumber
        ? "- 계좌 신고 이력: 조회됨, 등록된 신고 이력 없음"
        : "- 계좌번호: 입력되지 않음",
  );
  if (urlHits.length > 0) {
    lines.push(`- 본문 내 신고된 악성 도메인: ${urlHits.map((u) => `${u.domain}(${u.reports}건)`).join(", ")}`);
  }
  if (org) {
    lines.push(
      `- 사칭 의심 대상 기관: ${org.name} (공식 대표번호 ${org.official.join(", ")}) / 발신번호와 공식번호 일치 여부: ${
        officialMatch ? "일치" : "불일치 또는 확인 불가"
      }`,
    );
  }
  return lines.join("\n");
}

const KEYWORD_GUIDE = keywordDb.categories
  .map((c) => `- ${c.category}: ${c.keywords.slice(0, 8).join(", ")}`)
  .join("\n");

export async function POST(req: Request) {
  let input: SituationInput;
  try {
    input = (await req.json()) as SituationInput;
  } catch {
    return NextResponse.json({ error: "잘못된 요청 형식입니다." }, { status: 400 });
  }

  if (!input?.content || input.content.trim().length < 5) {
    return NextResponse.json(
      { error: "통화 내용 또는 문자 원문을 5자 이상 입력해 주세요." },
      { status: 400 },
    );
  }

  const client = getClient();
  if (!client) {
    return NextResponse.json(analyzeWithRules(input));
  }

  try {
    const response = await client.beta.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      betas: [...FALLBACK_BETAS],
      fallbacks: "default",
      system: [
        {
          type: "text",
          text: `${BASE_PERSONA}

[이번 작업]
사용자가 입력한 통화 요약 또는 문자 원문을 분석해 보이스피싱 위험도를 판정합니다.

[참고 위험 발화 패턴 사전]
${KEYWORD_GUIDE}

[판정 기준]
- 높음(60~100): 송금·현금인출 유도, 원격제어 앱 설치 유도, 기관 사칭 + 통제 발화가 결합된 경우, 또는 신고 이력이 확인된 번호/계좌.
- 중간(30~59): 위험 신호는 있으나 금전 요구가 아직 명확하지 않거나 정보가 부족한 경우.
- 낮음(0~29): 알려진 사기 패턴이 확인되지 않는 경우.

[반드시 지킬 것]
- detectedSignals의 keyword는 반드시 사용자 입력 원문에 실제로 등장한 표현이어야 합니다. 없는 문구를 만들지 마세요.
- 조회 결과에 "신고 이력 없음"이라고 되어 있으면 이력이 있다고 말하지 마세요.
- 정보가 부족하면 위험도를 과장하지 말고 '중간'과 함께 무엇이 더 필요한지 reasoning에 적으세요.`,
          cache_control: { type: "ephemeral" },
        },
      ],
      output_config: {
        effort: "medium",
        format: zodOutputFormat(AnalysisSchema),
      },
      messages: [
        {
          role: "user",
          content: `[입력 채널] ${input.channel}
[상대가 밝힌 소속] ${input.claimedOrg?.trim() || "없음"}
[발신번호] ${input.callerNumber?.trim() || "없음"}
[안내받은 계좌번호] ${input.accountNumber?.trim() || "없음"}

[목업 데이터베이스 조회 결과]
${buildContext(input)}

[통화 요약 / 문자 원문]
"""
${input.content.trim()}
"""`,
        },
      ],
    });

    if (response.stop_reason === "refusal" || !response.parsed_output) {
      return NextResponse.json(analyzeWithRules(input));
    }

    // 원문에 실제로 등장하지 않는 신호는 근거가 될 수 없으므로 여기서 버린다
    const { kept: verifiedSignals, dropped } = filterHallucinatedSignals(
      response.parsed_output.detectedSignals ?? [],
      [input.content, input.claimedOrg, input.callerNumber, input.accountNumber],
    );
    if (dropped.length > 0) {
      console.warn("[analyze] 원문에 없는 신호를 폐기했습니다:", dropped);
    }

    const result: RiskAnalysis = {
      ...response.parsed_output,
      detectedSignals: verifiedSignals,
      immediateAdvice: response.parsed_output.immediateAdvice ?? [],
      scoreBreakdown: buildScoreBreakdown(
        `${input.content} ${input.claimedOrg ?? ""}`,
        input.callerNumber,
        input.accountNumber,
      ),
      engine: "claude",
    };
    return NextResponse.json(result);
  } catch (err) {
    console.error("[analyze] LLM 호출 실패, 룰 기반 폴백으로 전환:", err);
    return NextResponse.json(analyzeWithRules(input));
  }
}
