import { findOrganization } from "./mock-db";
import type { DetectedSignal, EmergencyContact, RiskLevel, ScamStage, ScamType } from "./types";

/**
 * 도우미봇이 통화 중에 내놓을 말과 행동 지침.
 *
 * 왜 규칙 기반인가:
 * 개입이 필요한 순간은 정확히 LLM 응답을 기다릴 수 없는 순간이다. 이미 위험도가 '높음'이라는
 * 판정이 나온 뒤이므로, 여기서 또 한 번 네트워크를 타면 가장 중요한 몇 초를 버리게 된다.
 * 그래서 안심 멘트와 행동 지침은 결정론적으로 만들고, LLM이 만든 문장(liveMessage)은
 * 그 위에 얹기만 한다.
 *
 * 말투는 lib/anthropic.ts의 BASE_PERSONA를 따른다. 다그치지 않고, 단정하지 않고, 이모지 없이.
 */

/**
 * 받침에 따라 '로 / 으로'를 고른다.
 * 봇이 내놓는 문장은 화면에 그대로 읽히고 소리로도 나가므로, 조사가 틀리면 바로 눈에 띈다.
 */
function roParticle(word: string): "로" | "으로" {
  const last = word.trim().slice(-1);

  // 숫자는 읽었을 때의 끝소리로 판단한다. 0(영)·3(삼)·6(육)만 받침이 남는다.
  if (/[0-9]/.test(last)) return "036".includes(last) ? "으로" : "로";

  const code = last.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return "로";
  const jong = (code - 0xac00) % 28;
  // 받침이 없거나(0) 받침이 ㄹ(8)이면 '로'
  return jong === 0 || jong === 8 ? "로" : "으로";
}

/**
 * 봇이 건네는 안심 멘트.
 *
 * 두 줄만 쓴다. 개입이 필요한 순간의 사용자는 글을 읽는 상태가 아니라 소리를 듣는 상태다.
 * 네 줄을 쓰면 넷 다 안 읽히고, 두 줄을 쓰면 두 줄은 읽힌다.
 */
export function buildCalmScript(level: RiskLevel, stage: ScamStage): string[] {
  const isolated = stage === "고립" || stage === "압박" || stage === "편취";
  return [
    level === "높음" ? "지금 멈추세요." : "잠시 확인이 필요합니다.",
    isolated ? "말하지 말라는 요구 자체가 위험 신호입니다." : "혼자 판단하지 않으셔도 됩니다.",
  ];
}

export interface GuardianAction {
  kind: "tel" | "sms" | "link" | "speak";
  label: string;
  /** tel/sms는 전화번호, link는 경로, speak는 소리 내어 읽을 문장 */
  value: string;
}

export interface GuardianStep {
  id: string;
  /** 지금 해야 할 일. 이 한 줄만 읽어도 행동할 수 있게 쓴다 */
  title: string;
  /** 상대에게 그대로 소리 내어 읽을 말 (역질문). 있으면 크게 보여 준다 */
  say?: string;
  actions: GuardianAction[];
}

/**
 * 행동 지침을 급한 순서대로 만든다.
 *
 * 한 단계에 한 줄만 둔다. 설명을 붙이면 읽지 않고, 읽지 않으면 행동하지 않는다.
 * 근거와 부연은 통화가 끝난 뒤 결과 화면에서 얼마든지 볼 수 있다.
 */
export function buildGuardianSteps(opts: {
  transcript: string;
  scamType: ScamType;
  signals: DetectedSignal[];
  counterQuestions: string[];
  contacts: EmergencyContact[];
  callerNumber?: string;
}): GuardianStep[] {
  const { transcript, scamType, signals, counterQuestions, contacts, callerNumber } = opts;
  const steps: GuardianStep[] = [];
  const categories = new Set(signals.map((s) => s.category));

  // 1. 돈을 멈추는 것이 언제나 먼저다.
  steps.push({ id: "stop", title: "지금 돈을 보내지 마세요", actions: [] });

  // 2. 앱 설치는 송금만큼 급하다. 설치되는 순간 기기를 통째로 내주게 된다.
  if (categories.has("원격제어·악성앱 설치 유도")) {
    steps.push({ id: "app", title: "앱도, 링크도 누르지 마세요", actions: [] });
  }

  // 3. 상대에게 그대로 읽을 말. 진짜 기관·가족은 바로 답하고 사칭범은 못 답한다.
  if (counterQuestions.length > 0) {
    steps.push({
      id: "ask",
      title: "이렇게 되물어 보세요",
      say: counterQuestions[0],
      actions: [{ kind: "speak", label: "읽어 주기", value: counterQuestions[0] }],
    });
  }

  // 4. 기관을 사칭했다면 공식 대표번호를 그 자리에서 누를 수 있게 한다.
  const org = findOrganization(transcript);
  if (org && org.official.length > 0) {
    steps.push({
      id: "official",
      title: `${org.name}에 직접 확인하세요`,
      actions: [{ kind: "tel", label: `${org.official[0]} 걸기`, value: org.official[0] }],
    });
  }

  // 5. 고립을 깨는 단계. 이 서비스의 존재 이유에 가장 가깝다.
  const notifyText = buildNotifyText(scamType, callerNumber);
  if (contacts.length > 0) {
    const first = contacts[0];
    steps.push({
      id: "notify",
      title: `${first.name}님에게 알리세요`,
      actions: [
        { kind: "sms", label: "문자", value: `${first.phone}|${notifyText}` },
        { kind: "tel", label: "전화", value: first.phone },
      ],
    });
  } else {
    steps.push({
      id: "notify",
      title: "가족에게 알리세요",
      actions: [{ kind: "link", label: "연락처 등록", value: "/contacts" }],
    });
  }

  return steps;
}

/** 가족에게 보낼 문자 초안. 사용자 본인 번호에서 나가므로 받는 사람이 바로 믿는다. */
export function buildNotifyText(scamType: ScamType, callerNumber?: string): string {
  const lines = [
    "지금 보이스피싱 의심 전화를 받고 있어요.",
    scamType !== "판단 보류"
      ? `수법은 '${scamType}'${roParticle(scamType)} 보인다고 합니다.`
      : null,
    callerNumber?.trim() ? `발신번호는 ${callerNumber.trim()}입니다.` : null,
    "확인될 때까지 아무것도 보내지 않을게요. 이 문자 보면 전화 한 번만 주세요.",
  ].filter(Boolean) as string[];
  return lines.join(" ");
}
