import { inferScamType, scanKeywords } from "./fallback-analyzer";
import { lookupReportedPhone, lookupReportedUrls } from "./mock-db";
import { buildScoreBreakdown } from "./score-breakdown";
import { SCAM_STAGES } from "./types";
import type {
  DetectedSignal,
  LiveAnalyzeRequest,
  LiveRiskUpdate,
  RiskLevel,
  ScamStage,
  ScamType,
} from "./types";

export function levelFromScore(score: number): RiskLevel {
  return score >= 60 ? "높음" : score >= 30 ? "중간" : "낮음";
}

/**
 * 실시간 위험도가 한 번 오른 뒤 다시 툭 떨어지면 화면이 깜빡여 신뢰를 잃는다.
 * 이미 나온 발화는 사라지지 않으므로, 하락은 한 번에 8점까지만 허용한다.
 */
export function clampAgainstPrevious(score: number, previousScore: number | null): number {
  const bounded = Math.max(0, Math.min(100, Math.round(score)));
  if (previousScore === null) return bounded;
  return Math.max(bounded, previousScore - 8);
}

export function trendOf(score: number, previousScore: number | null) {
  if (previousScore === null) return "유지" as const;
  if (score >= previousScore + 5) return "상승" as const;
  if (score <= previousScore - 5) return "하락" as const;
  return "유지" as const;
}

/* ------------------------------------------------------------------ *
 * 시나리오 단계 추정
 * ------------------------------------------------------------------ */

/** 키워드 카테고리가 가리키는 시나리오 단계 */
const CATEGORY_STAGE: Record<string, ScamStage> = {
  "기관 사칭": "신뢰구축",
  "가족·지인 사칭": "신뢰구축",
  "대출·투자 미끼": "신뢰구축",
  "통제·고립 발화": "고립",
  "긴급성·압박": "압박",
  "원격제어·악성앱 설치 유도": "압박",
  "개인정보 요구": "압박",
  "스미싱 문자 패턴": "압박",
  "안전계좌·송금 유도": "편취",
};

/** 각 단계 다음에 통상적으로 이어지는 요구 */
const NEXT_MOVE: Record<ScamStage, string> = {
  미확인: "조금 더 들어봐야 합니다. 상대가 어떤 요구를 하는지 지켜보겠습니다.",
  접근: "곧 사건이나 피해 상황을 설명하며 자신을 믿게 만들려 할 수 있습니다.",
  신뢰구축: "다음에는 \"아무에게도 말하지 마세요\", \"전화를 끊지 마세요\" 같은 요구가 나올 가능성이 높습니다.",
  고립: "이어서 원격제어 앱 설치나 주민등록번호·카드번호 확인을 요구할 가능성이 높습니다.",
  압박: "다음은 안전계좌 이체나 현금 인출 요구일 가능성이 높습니다. 여기서 반드시 멈춰야 합니다.",
  편취: "계좌번호를 부르며 즉시 이체를 재촉하거나, 직접 만나 현금을 건네라고 할 수 있습니다.",
};

export function nextMoveOf(stage: ScamStage): string {
  return NEXT_MOVE[stage];
}

export function stageIndex(stage: ScamStage): number {
  const i = SCAM_STAGES.indexOf(stage);
  return i < 0 ? 0 : i;
}

/**
 * 단계는 되돌아가지 않는다. 상대가 해명을 했다고 해서 이미 지나온 고립 발화가
 * 없던 일이 되지는 않기 때문이다.
 */
export function clampStage(next: ScamStage, previous: ScamStage | null): ScamStage {
  if (!previous) return next;
  return stageIndex(next) >= stageIndex(previous) ? next : previous;
}

/** 감지된 신호 카테고리 중 가장 진행된 단계를 현재 단계로 본다 */
export function inferStage(categories: Iterable<string>, hasSpeech: boolean): ScamStage {
  let best: ScamStage = hasSpeech ? "접근" : "미확인";
  for (const c of categories) {
    const mapped = CATEGORY_STAGE[c];
    if (mapped && stageIndex(mapped) > stageIndex(best)) best = mapped;
  }
  return best;
}

/* ------------------------------------------------------------------ *
 * 역질문 코칭
 * ------------------------------------------------------------------ */

/**
 * 사용자가 상대에게 그대로 읽을 수 있는 검증 질문.
 * 원칙: 진짜 기관·가족이면 1초 만에 답하지만 사칭범은 답하지 못할 것,
 * 상대를 자극하지 않을 것, 사용자의 개인정보를 되레 노출시키지 않을 것.
 */
const QUESTIONS_BY_TYPE: Partial<Record<ScamType, string[]>> = {
  "기관 사칭": [
    "소속 부서와 성함, 직통번호를 불러주시겠어요? 대표번호로 제가 다시 걸어 확인하겠습니다.",
    "사건번호를 한 번만 더 불러주세요. 받아 적겠습니다.",
    "지금 끊고 해당 기관 대표번호로 직접 확인한 뒤 다시 통화하겠습니다.",
  ],
  "가족·지인 사칭": [
    "지금 영상통화로 얼굴 한 번만 보여줄래?",
    "우리 둘만 아는 이야기 하나만 말해줄래?",
    "원래 쓰던 번호로 내가 다시 걸어볼게.",
  ],
  "대출 사기": [
    "취급하시는 금융회사 이름과 등록번호를 알려주세요. 금융소비자정보포털에서 확인하겠습니다.",
    "대출금을 받기 전에 수수료를 먼저 내는 절차가 법적으로 가능한가요?",
  ],
  "투자·리딩방 사기": [
    "운용사 이름과 금융투자업 등록번호를 알려주세요.",
    "원금이 보장된다는 근거를 서면으로 보내주실 수 있나요?",
  ],
  "택배·결제 스미싱": [
    "주문번호와 발송지를 알려주세요. 공식 앱에서 직접 조회하겠습니다.",
  ],
};

/** 특정 요구가 나왔을 때 그 자리에서 바로 되물어야 하는 질문 */
const QUESTIONS_BY_CATEGORY: { match: string[]; question: string }[] = [
  {
    match: ["원격", "악성앱", "앱 설치", "링크"],
    question: "그 앱 이름이 정확히 뭔가요? 공식 스토어에서 직접 검색해서 설치하겠습니다.",
  },
  {
    match: ["안전계좌", "송금"],
    question: "그 계좌의 예금주 이름이 어떻게 되나요? 은행 창구에 가서 직접 처리하겠습니다.",
  },
  {
    match: ["통제", "고립"],
    question: "가족에게 알리면 안 되는 이유가 무엇인가요? 근거가 되는 법 조항을 알려주세요.",
  },
  {
    match: ["개인정보"],
    question: "주민등록번호나 카드번호는 전화로 알려드리지 않습니다. 다른 방법으로 확인해 주세요.",
  },
  {
    match: ["긴급", "압박"],
    question: "왜 지금 당장이어야 하나요? 내일 직접 방문해서 처리하면 안 되나요?",
  },
];

/**
 * 위험도가 낮으면 역질문을 권하지 않는다.
 * 정상 통화 중에 상대를 의심하게 만드는 것도 서비스의 실패이기 때문이다.
 */
export function buildCounterQuestions(
  level: RiskLevel,
  scamType: ScamType,
  categories: Iterable<string>,
  stage: ScamStage,
): string[] {
  if (level === "낮음" && stage !== "고립" && stage !== "압박" && stage !== "편취") return [];

  const picked: string[] = [];
  for (const rule of QUESTIONS_BY_CATEGORY) {
    for (const c of categories) {
      if (rule.match.some((m) => c.includes(m))) {
        picked.push(rule.question);
        break;
      }
    }
  }
  picked.push(...(QUESTIONS_BY_TYPE[scamType] ?? QUESTIONS_BY_TYPE["기관 사칭"] ?? []));

  return Array.from(new Set(picked)).slice(0, 3);
}

/**
 * 룰 기반 실시간 분석 폴백.
 * 누적 트랜스크립트 전체를 매번 다시 훑되, 이미 보고한 키워드는 newSignals에서 뺀다.
 */
export function analyzeLiveWithRules(req: LiveAnalyzeRequest): LiveRiskUpdate {
  const scan = scanKeywords(req.transcript);
  const signals: DetectedSignal[] = [...scan.signals];
  let score = scan.score;

  const phoneHit = lookupReportedPhone(req.callerNumber);
  if (phoneHit) {
    score += 35;
    signals.unshift({
      keyword: req.callerNumber ?? phoneHit.number,
      category: "신고 이력 발신번호",
      explanation: `최근 ${phoneHit.reports}건 신고된 번호입니다 (${phoneHit.type}).`,
    });
  }
  for (const u of lookupReportedUrls(req.transcript)) {
    score += 30;
    signals.push({
      keyword: u.domain,
      category: "악성 링크",
      explanation: `${u.reports}건 신고된 도메인입니다. ${u.memo}`,
    });
  }

  const finalScore = clampAgainstPrevious(score, req.previousScore);
  const riskLevel = levelFromScore(finalScore);
  const trend = trendOf(finalScore, req.previousScore);
  const scamStage = clampStage(inferStage(scan.categories, req.transcript.length > 0), req.previousStage);
  const scamType = inferScamType(scan.categories, phoneHit?.type);

  const known = new Set(req.knownKeywords.map((k) => k.toLowerCase()));
  const newSignals = signals.filter((s) => !known.has(s.keyword.toLowerCase())).slice(0, 4);

  const shouldIntervene =
    riskLevel === "높음" || (riskLevel === "중간" && (trend === "상승" || newSignals.length > 0));

  return {
    riskLevel,
    riskScore: finalScore,
    trend,
    newSignals,
    shouldIntervene,
    reason: buildReason(newSignals, trend, finalScore),
    liveMessage: buildLiveMessage(riskLevel, newSignals),
    scamType,
    scamStage,
    predictedNextMove: nextMoveOf(scamStage),
    counterQuestions: buildCounterQuestions(riskLevel, scamType, scan.categories, scamStage),
    scoreBreakdown: buildScoreBreakdown(req.transcript, req.callerNumber),
    engine: "fallback",
  };
}

function buildReason(newSignals: DetectedSignal[], trend: string, score: number): string {
  if (newSignals.length === 0) {
    return trend === "유지"
      ? `새로 감지된 위험 신호는 없습니다. 현재 누적 위험 점수는 ${score}점입니다.`
      : `새 신호는 없지만 누적 점수가 ${score}점으로 조정되었습니다.`;
  }
  const list = newSignals.map((s) => `"${s.keyword}"(${s.category})`).join(", ");
  return `이번 구간에서 ${list} 신호가 새로 확인되어 위험 점수가 ${score}점이 되었습니다.`;
}

function buildLiveMessage(level: RiskLevel, newSignals: DetectedSignal[]): string {
  if (level === "높음") {
    const cat = newSignals[0]?.category;
    return cat
      ? `${cat} 신호가 확인되었습니다. 지금은 어떤 것도 결정하지 마시고 통화를 끊어 주세요.`
      : "지금은 어떤 것도 결정하지 마시고 통화를 끊어 주세요. 제가 확인하겠습니다.";
  }
  if (level === "중간") {
    return "확인이 필요한 신호가 보입니다. 송금이나 앱 설치 요구가 나오면 바로 멈춰 주세요.";
  }
  return "아직 뚜렷한 위험 신호는 없습니다. 계속 듣고 있겠습니다.";
}
