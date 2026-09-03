import { NextResponse } from "next/server";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { BASE_PERSONA, FALLBACK_BETAS, MODEL, getClient } from "@/lib/anthropic";
import { helplines } from "@/lib/mock-db";
import { describeContactReply, judgeContactReply } from "@/lib/contact-reply";
import type { CaseState, FollowUpReport } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const ReportSchema = z.object({
  timeline: z
    .array(
      z.object({
        time: z.string().describe("'1단계', '2단계' 처럼 순서 또는 상대 시점 표기"),
        title: z.string().describe("짧은 사건 제목"),
        detail: z.string().describe("한 문장 설명"),
      }),
    )
    .max(8)
    .describe("상황 발생부터 대응까지의 흐름"),
  facts: z
    .array(z.string())
    .max(8)
    .describe("신고 시 필요한 사실관계만. 추측·감상 제외. 각 항목 한 문장"),
  actions: z
    .array(
      z.object({
        title: z.string().describe("행동 제목"),
        detail: z.string().describe("구체적 절차를 2문장 이내로"),
      }),
    )
    .max(5)
    .describe("지금부터 순서대로 해야 할 일"),
  summary: z.string().describe("전체 상황을 3문장 이내로 정리"),
});

function fallbackReport(state: CaseState): FollowUpReport {
  const a = state.analysis;
  return {
    timeline: [
      {
        time: "1단계",
        title: "상황 접수",
        detail: `${state.input?.channel ?? "통화"} 내용을 피싱브레이크에 입력했습니다.`,
      },
      {
        time: "2단계",
        title: "AI 위험도 분석",
        detail: a ? `위험도 ${a.riskLevel}(${a.riskScore}점), 의심 유형 ${a.scamType}로 판정되었습니다.` : "위험도 분석 기록이 없습니다.",
      },
      {
        time: "3단계",
        title: "역검증 수행",
        detail:
          state.verification.length > 0
            ? state.verification.map((s) => s.title).join(" → ") +
              " 순으로 확인했습니다." +
              (state.contactReply
                ? ` ${describeContactReply(state.contactReply.reply, state.contactReply.respondent)}.`
                : "")
            : "역검증을 수행하지 않았습니다.",
      },
      {
        time: "4단계",
        title: "AI 상담",
        detail: `${state.chat.filter((m) => m.role === "user").length}건의 질문에 대해 AI 상담을 진행했습니다.`,
      },
    ],
    facts: [
      `채널: ${state.input?.channel ?? "미상"}`,
      `발신번호: ${state.input?.callerNumber?.trim() || "미입력"}`,
      `상대 주장 소속: ${state.input?.claimedOrg?.trim() || "미입력"}`,
      `안내받은 계좌: ${state.input?.accountNumber?.trim() || "미입력"}`,
      `AI 판정 위험도: ${a ? `${a.riskLevel} (${a.riskScore}점)` : "미판정"}`,
      ...(a?.detectedSignals.slice(0, 3).map((s) => `확인된 위험 신호: "${s.keyword}" (${s.category})`) ?? []),
      ...(state.contactReply
        ? [describeContactReply(state.contactReply.reply, state.contactReply.respondent)]
        : []),
    ],
    actions: [
      {
        title: "송금했다면 즉시 지급정지 요청",
        detail: "송금한 은행 고객센터 또는 112에 전화해 계좌 지급정지를 요청하세요. 빠를수록 회수 가능성이 높습니다.",
      },
      { title: "112 경찰 신고", detail: "가까운 경찰서를 방문하거나 112로 신고해 사건사고사실확인원을 발급받으세요." },
      { title: "1332 금융감독원 상담", detail: "지급정지·피해구제 신청 절차를 안내받을 수 있습니다." },
      {
        title: "악성앱 점검",
        detail: "상대가 안내한 앱을 설치했다면 즉시 삭제하고, 휴대폰 초기화 또는 서비스센터 점검을 받으세요.",
      },
      { title: "명의도용 차단", detail: "금융결제원 계좌정보통합관리서비스와 명의도용방지서비스에서 본인 명의 계좌·회선을 확인하세요." },
    ],
    summary: a
      ? `${state.input?.channel ?? "통화"} 상황에 대해 AI가 위험도 ${a.riskLevel}(${a.riskScore}점)로 판정했고, 신고 이력 대조와 공식 대표번호 확인을 거쳤습니다. 아직 금전 피해가 없다면 추가 접촉을 차단하고, 피해가 있다면 즉시 112와 1332에 신고하세요.`
      : "분석 기록이 충분하지 않습니다. 상황 입력부터 다시 진행해 주세요.",
    engine: "fallback",
  };
}

export async function POST(req: Request) {
  let state: CaseState;
  try {
    state = (await req.json()) as CaseState;
  } catch {
    return NextResponse.json({ error: "잘못된 요청 형식입니다." }, { status: 400 });
  }
  if (!state?.input?.content) {
    return NextResponse.json({ error: "정리할 상담 기록이 없습니다." }, { status: 400 });
  }

  const client = getClient();
  if (!client) return NextResponse.json(fallbackReport(state));

  try {
    const res = await client.beta.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      betas: [...FALLBACK_BETAS],
      fallbacks: "default",
      system: `${BASE_PERSONA}

[이번 작업]
상담이 끝난 뒤 사후 지원 리포트를 작성합니다.

[작성 규칙]
- timeline은 실제 기록에 있는 일만 적습니다. 없었던 일을 만들지 마세요.
- facts에는 감정 표현이나 추측 없이, 신고서에 그대로 옮겨 적을 수 있는 사실만 담습니다.
- actions는 사용자의 현재 상황에 맞춰 우선순위 순으로 배열합니다. 이미 송금한 정황이 대화에 있으면 지급정지를 1순위로 두세요.
- 공식 창구 번호: ${helplines.map((h) => `${h.name} ${h.number}(${h.desc})`).join(" / ")}.
- 지급정지 절차는 "송금 은행 고객센터 또는 112 신고 → 계좌 지급정지 신청 → 경찰서에서 사건사고사실확인원 발급 → 은행에 피해구제 신청" 순서를 기준으로 안내하세요.`,
      output_config: { effort: "medium", format: zodOutputFormat(ReportSchema) },
      messages: [
        {
          role: "user",
          content: `[상황 입력]
채널: ${state.input.channel}
발신번호: ${state.input.callerNumber?.trim() || "없음"}
상대 주장 소속: ${state.input.claimedOrg?.trim() || "없음"}
안내받은 계좌: ${state.input.accountNumber?.trim() || "없음"}
내용: """${state.input.content.trim().slice(0, 3000)}"""

[AI 위험도 분석]
${
  state.analysis
    ? `위험도 ${state.analysis.riskLevel} (${state.analysis.riskScore}점) / 유형 ${state.analysis.scamType}
근거: ${state.analysis.reasoning}
신호: ${state.analysis.detectedSignals.map((s) => `${s.keyword}(${s.category})`).join(", ") || "없음"}`
    : "수행되지 않음"
}

[역검증 결과]
${state.verification.map((s) => `${s.title} [${s.status}] ${s.headline}\n  ${s.details.join("\n  ")}`).join("\n") || "수행되지 않음"}

[비상연락처 응답]
${
  state.contactReply
    ? `${describeContactReply(state.contactReply.reply, state.contactReply.respondent)}
  판정: ${judgeContactReply(state.contactReply.reply, state.analysis?.scamType ?? "판단 보류", state.contactReply.respondent).headline}`
    : "응답 기록 없음"
}

[AI 상담 대화 로그]
${state.chat.map((m) => `${m.role === "user" ? "사용자" : "AI"}: ${m.content}`).join("\n").slice(0, 4000) || "대화 없음"}`,
        },
      ],
    });

    if (res.stop_reason === "refusal" || !res.parsed_output) {
      return NextResponse.json(fallbackReport(state));
    }

    const report: FollowUpReport = { ...res.parsed_output, engine: "claude" };
    return NextResponse.json(report);
  } catch (err) {
    console.error("[summary] 리포트 생성 실패, 템플릿으로 대체:", err);
    return NextResponse.json(fallbackReport(state));
  }
}
