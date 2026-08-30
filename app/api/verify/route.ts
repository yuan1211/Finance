import { NextResponse } from "next/server";
import { BASE_PERSONA, FALLBACK_BETAS, MODEL, getClient } from "@/lib/anthropic";
import {
  findOrganization,
  lookupReportedAccount,
  lookupReportedPhone,
  lookupReportedUrls,
  matchesOfficialNumber,
} from "@/lib/mock-db";
import type { EmergencyContact, RiskAnalysis, SituationInput, VerifyStepResult } from "@/lib/types";
import { isMailEnabled, sendEmergencyNotice } from "@/lib/notify";

export const runtime = "nodejs";
export const maxDuration = 60;

interface VerifyRequest {
  input: SituationInput;
  analysis: RiskAnalysis | null;
  contacts: EmergencyContact[];
}

/** 1차 · 2차 검증은 목업 DB 대조로 결정론적으로 처리한다 */
function runLookups(input: SituationInput): VerifyStepResult[] {
  const steps: VerifyStepResult[] = [];

  // 1차: 신고 이력 대조
  const phoneHit = lookupReportedPhone(input.callerNumber);
  const accountHit = lookupReportedAccount(input.accountNumber);
  const urlHits = lookupReportedUrls(input.content);
  const reportedDetails: string[] = [];

  if (input.callerNumber?.trim()) {
    reportedDetails.push(
      phoneHit
        ? `발신번호 ${input.callerNumber} — 신고 ${phoneHit.reports}건 (${phoneHit.type}, 최종 ${phoneHit.lastReportedAt})`
        : `발신번호 ${input.callerNumber} — 신고 이력 데이터베이스에서 확인되지 않음`,
    );
  } else {
    reportedDetails.push("발신번호가 입력되지 않아 대조하지 못했습니다.");
  }

  if (input.accountNumber?.trim()) {
    reportedDetails.push(
      accountHit
        ? `계좌 ${input.accountNumber} — ${accountHit.bank}, 신고 ${accountHit.reports}건 (${accountHit.memo})`
        : `계좌 ${input.accountNumber} — 신고 이력 데이터베이스에서 확인되지 않음`,
    );
  } else {
    reportedDetails.push("안내받은 계좌번호가 입력되지 않았습니다.");
  }

  for (const u of urlHits) {
    reportedDetails.push(`본문 링크 ${u.domain} — 신고 ${u.reports}건 (${u.memo})`);
  }

  const reportedHit = Boolean(phoneHit || accountHit || urlHits.length > 0);
  steps.push({
    id: "reported",
    title: "1차 · 신고 이력 대조",
    status: reportedHit ? "danger" : input.callerNumber || input.accountNumber ? "clear" : "warning",
    headline: reportedHit
      ? "신고 이력이 있는 번호 또는 계좌가 확인되었습니다."
      : input.callerNumber || input.accountNumber
        ? "등록된 신고 이력은 확인되지 않았습니다. 이력이 없다고 해서 안전한 것은 아닙니다."
        : "대조할 번호·계좌 정보가 부족합니다.",
    details: reportedDetails,
  });

  // 2차: 공식 대표번호 진위확인
  const org = findOrganization(`${input.claimedOrg ?? ""} ${input.content}`);
  const officialDetails: string[] = [];
  let officialStatus: VerifyStepResult["status"] = "warning";
  let officialHeadline = "사칭 대상으로 볼 만한 기관명이 확인되지 않았습니다.";

  if (org) {
    const matched = matchesOfficialNumber(org, input.callerNumber);
    officialDetails.push(`상대가 밝힌 소속: ${org.name} (${org.category})`);
    officialDetails.push(`${org.name} 공식 대표번호: ${org.official.join(", ")}`);
    if (input.callerNumber?.trim()) {
      officialDetails.push(`실제 발신번호: ${input.callerNumber}`);
      officialDetails.push(
        matched
          ? "발신번호가 공식 대표번호와 일치합니다. 다만 발신번호는 변작될 수 있으므로 반드시 끊고 직접 걸어 확인하세요."
          : "발신번호가 공식 대표번호와 일치하지 않습니다.",
      );
      officialStatus = matched ? "warning" : "danger";
      officialHeadline = matched
        ? "번호는 일치하지만, 발신번호 변작 가능성이 있어 직접 확인이 필요합니다."
        : `${org.name}의 공식 대표번호와 발신번호가 다릅니다.`;
    } else {
      officialDetails.push("발신번호가 입력되지 않아 대조하지 못했습니다.");
      officialHeadline = `${org.name} 공식 대표번호를 확인했습니다. 통화를 끊고 이 번호로 직접 확인하세요.`;
    }
  } else {
    officialDetails.push("입력 내용에서 은행·수사기관·행정기관 이름을 찾지 못했습니다.");
    officialDetails.push("금전 요구가 있었다면 해당 기관 공식 앱이나 홈페이지의 대표번호로 직접 확인하세요.");
  }

  steps.push({
    id: "official",
    title: "2차 · 공식 대표번호 진위확인",
    status: officialStatus,
    headline: officialHeadline,
    details: officialDetails,
  });

  return steps;
}

const FALLBACK_NOTICE = (input: SituationInput, analysis: RiskAnalysis | null) =>
  [
    "[피싱브레이크 알림] 등록하신 가족/지인이 보이스피싱 의심 상황을 확인 중입니다.",
    `- 상황: ${input.channel} 수신${input.claimedOrg ? ` (상대 주장 소속: ${input.claimedOrg})` : ""}`,
    input.callerNumber ? `- 발신번호: ${input.callerNumber}` : null,
    `- AI 위험도 판정: ${analysis?.riskLevel ?? "확인 중"}${analysis ? ` (${analysis.riskScore}점, ${analysis.scamType})` : ""}`,
    "- 요청: 지금 통화나 송금을 하지 않도록 직접 연락해 확인해 주세요.",
    "※ 본 메시지는 시뮬레이션 데모로 실제 발송되지 않았습니다.",
  ]
    .filter(Boolean)
    .join("\n");

async function buildNotifyMessage(body: VerifyRequest): Promise<string> {
  const client = getClient();
  if (!client) return FALLBACK_NOTICE(body.input, body.analysis);

  try {
    const res = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 8000,
      betas: [...FALLBACK_BETAS],
      fallbacks: "default",
      system: `${BASE_PERSONA}

[이번 작업]
사용자가 미리 등록한 비상연락처(가족·지인)에게 보낼 '객관적 상황 요약문'을 작성합니다.

[작성 규칙]
- 6줄 이내, 개조식. 인사말과 사족은 넣지 마세요.
- 사실만 적습니다. 추측이나 감정적 표현은 넣지 마세요.
- 수신자가 무엇을 해야 하는지 마지막 줄에 한 문장으로 적습니다.
- 사용자의 계좌번호 전체나 주민등록번호 등 민감정보는 절대 포함하지 마세요.
- 마지막에 "※ 본 메시지는 시뮬레이션 데모로 실제 발송되지 않았습니다."를 반드시 붙이세요.`,
      messages: [
        {
          role: "user",
          content: `[수신자] ${
            body.contacts.length > 0
              ? body.contacts.map((c) => `${c.name}(${c.relation})`).join(", ")
              : "등록된 비상연락처 없음"
          }
[채널] ${body.input.channel}
[상대 주장 소속] ${body.input.claimedOrg?.trim() || "없음"}
[발신번호] ${body.input.callerNumber?.trim() || "없음"}
[AI 위험도] ${body.analysis ? `${body.analysis.riskLevel} / ${body.analysis.riskScore}점 / ${body.analysis.scamType}` : "미판정"}
[판단 근거] ${body.analysis?.reasoning ?? "없음"}

[통화·문자 내용]
"""
${body.input.content.trim().slice(0, 2000)}
"""`,
        },
      ],
    });

    if (res.stop_reason === "refusal") return FALLBACK_NOTICE(body.input, body.analysis);
    const text = res.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { text: string }).text)
      .join("\n")
      .trim();
    return text || FALLBACK_NOTICE(body.input, body.analysis);
  } catch (err) {
    console.error("[verify] 요약문 생성 실패, 템플릿으로 대체:", err);
    return FALLBACK_NOTICE(body.input, body.analysis);
  }
}

type NotifyOutcomeLike = {
  sent: string[];
  missingEmail: string[];
  failed: { name: string; reason: string }[];
  live: boolean;
};

function buildNotifyStatus(total: number, o: NotifyOutcomeLike): VerifyStepResult["status"] {
  if (total === 0) return "warning";
  if (o.sent.length === 0) return "warning";
  return o.failed.length > 0 || o.missingEmail.length > 0 ? "warning" : "clear";
}

function buildNotifyHeadline(total: number, o: NotifyOutcomeLike): string {
  if (total === 0) {
    return "등록된 비상연락처가 없어 발송하지 못했습니다. 아래 요약문을 직접 가족에게 보여주세요.";
  }
  if (o.sent.length === 0) {
    return "비상연락처에 발송하지 못했습니다. 아래 요약문을 직접 가족에게 보여주세요.";
  }
  return o.live
    ? `${o.sent.join(", ")} 님에게 상황 요약문을 이메일로 발송했습니다.`
    : `${o.sent.join(", ")} 님에게 상황 요약문을 발송했습니다. (시뮬레이션)`;
}

function buildNotifyDetails(contacts: EmergencyContact[], o: NotifyOutcomeLike): string[] {
  const details: string[] = [];

  details.push(
    contacts.length > 0
      ? `수신자: ${contacts.map((c) => `${c.name} (${c.relation}, ${c.phone})`).join(" / ")}`
      : "수신자: 없음 — 비상연락처 등록 페이지에서 추가할 수 있습니다.",
  );

  if (o.missingEmail.length > 0) {
    details.push(
      `이메일이 등록되지 않아 보내지 못한 분: ${o.missingEmail.join(", ")} — 비상연락처에 이메일을 추가하면 실제로 발송됩니다.`,
    );
  }
  if (o.failed.length > 0) {
    details.push(`발송 실패: ${o.failed.map((f) => `${f.name}(${f.reason})`).join(", ")}`);
  }
  details.push(
    o.live
      ? "실제 이메일로 발송됩니다. 문자·카카오 발송은 사업자 등록과 사전 승인이 필요해 MVP 범위에서 제외했습니다."
      : "현재 메일 발송 키(RESEND_API_KEY)가 설정되지 않아 시뮬레이션으로 처리했습니다. 키를 설정하면 실제 이메일이 발송됩니다.",
  );

  return details;
}

export async function POST(req: Request) {
  let body: VerifyRequest;
  try {
    body = (await req.json()) as VerifyRequest;
  } catch {
    return NextResponse.json({ error: "잘못된 요청 형식입니다." }, { status: 400 });
  }
  if (!body?.input?.content) {
    return NextResponse.json({ error: "분석할 상황 정보가 없습니다." }, { status: 400 });
  }

  const steps = runLookups(body.input);
  const contacts = body.contacts ?? [];
  const notifyMessage = await buildNotifyMessage({ ...body, contacts });

  // 고립을 깨는 단계다. 메일 키가 설정돼 있으면 실제로 발송한다.
  const outcome =
    contacts.length > 0
      ? await sendEmergencyNotice(contacts, notifyMessage)
      : { sent: [], missingEmail: [], failed: [], live: isMailEnabled() };

  steps.push({
    id: "notify",
    title: "3차 · 비상연락처 상황 공유",
    status: buildNotifyStatus(contacts.length, outcome),
    headline: buildNotifyHeadline(contacts.length, outcome),
    details: buildNotifyDetails(contacts, outcome),
  });

  return NextResponse.json({ steps, notifyMessage });
}
