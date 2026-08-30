import type { DetectedSignal, RiskAnalysis, ScamType, SituationInput } from "./types";
import { keywordDb, lookupReportedAccount, lookupReportedPhone, lookupReportedUrls } from "./mock-db";
import { buildScoreBreakdown } from "./score-breakdown";

/**
 * 룰 기반 위험도 분석 폴백.
 * ANTHROPIC_API_KEY가 없거나 LLM 호출이 실패해도 데모가 멈추지 않도록,
 * 키워드 사전 + 신고 이력 DB로 동일한 형태의 결과를 만들어 낸다.
 */
export interface KeywordScan {
  score: number;
  signals: DetectedSignal[];
  categories: Set<string>;
  /** 어느 카테고리가 몇 점을 보탰는지 — 점수 기여도 분해에 쓴다 */
  contributions: { label: string; points: number; hits: string[] }[];
}

/**
 * 키워드 사전으로 텍스트를 훑어 위험 점수와 신호 목록을 만든다.
 * 텍스트 입력 분석과 실시간 통화 분석이 같은 기준을 쓰도록 여기 한 곳에 둔다.
 */
export function scanKeywords(text: string): KeywordScan {
  const lowered = text.toLowerCase();
  const signals: DetectedSignal[] = [];
  const categories = new Set<string>();
  const contributions: KeywordScan["contributions"] = [];
  let score = 0;

  for (const cat of keywordDb.categories) {
    const found = cat.keywords.filter((k) => lowered.includes(k.toLowerCase()));
    if (found.length === 0) continue;
    categories.add(cat.category);
    // 같은 카테고리 내 중복 적중은 가중치를 체감시켜 과대평가를 막는다
    const points = cat.weight + Math.min(found.length - 1, 3) * 4;
    score += points;
    contributions.push({ label: cat.category, points, hits: found.slice(0, 4) });
    for (const k of found.slice(0, 3)) {
      signals.push({ keyword: k, category: cat.category, explanation: cat.explanation });
    }
  }

  return { score, signals, categories, contributions };
}

export function analyzeWithRules(input: SituationInput): RiskAnalysis {
  const scan = scanKeywords(`${input.content} ${input.claimedOrg ?? ""}`);
  const signals: DetectedSignal[] = [...scan.signals];
  const hitCategories = scan.categories;
  let score = scan.score;

  const phoneHit = lookupReportedPhone(input.callerNumber);
  if (phoneHit) {
    score += 35;
    signals.unshift({
      keyword: input.callerNumber ?? phoneHit.number,
      category: "신고 이력 발신번호",
      explanation: `최근 ${phoneHit.reports}건 신고된 번호입니다 (${phoneHit.type}).`,
    });
  }

  const accountHit = lookupReportedAccount(input.accountNumber);
  if (accountHit) {
    score += 35;
    signals.unshift({
      keyword: input.accountNumber ?? accountHit.number,
      category: "신고 이력 계좌",
      explanation: `${accountHit.bank} 계좌로 ${accountHit.reports}건 신고 이력이 있습니다.`,
    });
  }

  for (const u of lookupReportedUrls(input.content)) {
    score += 30;
    signals.push({
      keyword: u.domain,
      category: "악성 링크",
      explanation: `${u.reports}건 신고된 도메인입니다. ${u.memo}`,
    });
  }

  score = Math.min(100, score);

  const riskLevel = score >= 60 ? "높음" : score >= 30 ? "중간" : "낮음";
  const scamType = inferScamType(hitCategories, phoneHit?.type);

  const reasoning =
    signals.length === 0
      ? "입력하신 내용에서는 알려진 보이스피싱 발화 패턴이나 신고 이력이 확인되지 않았습니다. 다만 대화 전체가 아닌 일부만 입력된 경우 놓친 신호가 있을 수 있습니다."
      : `입력 내용에서 ${Array.from(hitCategories).slice(0, 3).join(", ")}${
          hitCategories.size > 3 ? " 등" : ""
        } 유형의 위험 신호 ${signals.length}건이 확인되었습니다. ${
          phoneHit ? "발신번호가 신고 이력 데이터베이스에 등록되어 있어 위험도를 크게 높여 판단했습니다. " : ""
        }${accountHit ? "안내받은 계좌 역시 신고 이력이 있는 계좌입니다. " : ""}종합 위험 점수는 100점 만점에 ${score}점입니다.`;

  return {
    riskLevel,
    riskScore: score,
    scamType,
    detectedSignals: signals.slice(0, 8),
    reasoning,
    immediateAdvice: buildAdvice(riskLevel, hitCategories),
    scoreBreakdown: buildScoreBreakdown(
      `${input.content} ${input.claimedOrg ?? ""}`,
      input.callerNumber,
      input.accountNumber,
    ),
    calmMessage:
      riskLevel === "높음"
        ? "지금 바로 결정하지 않으셔도 괜찮습니다. 통화를 끊고 저와 함께 하나씩 확인해 볼게요."
        : riskLevel === "중간"
          ? "아직 확실하지는 않지만 확인이 필요한 신호가 보입니다. 제가 대신 확인해 드릴게요."
          : "현재까지는 뚜렷한 위험 신호가 보이지 않습니다. 그래도 궁금한 점이 있으면 함께 확인해 봐요.",
    engine: "fallback",
  };
}

export function inferScamType(cats: Set<string>, reportedType?: string): ScamType {
  if (reportedType?.includes("가족")) return "가족·지인 사칭";
  if (reportedType?.includes("대출")) return "대출 사기";
  if (cats.has("가족·지인 사칭")) return "가족·지인 사칭";
  if (cats.has("대출·투자 미끼")) return "대출 사기";
  if (cats.has("스미싱 문자 패턴")) return "택배·결제 스미싱";
  if (cats.has("기관 사칭")) return "기관 사칭";
  if (cats.has("안전계좌·송금 유도") || cats.has("원격제어·악성앱 설치 유도")) return "기관 사칭";
  return "판단 보류";
}

export function buildAdvice(level: string, cats: Set<string>): string[] {
  const advice: string[] = [];
  if (level !== "낮음") {
    advice.push("지금은 어떤 금액도 이체하거나 인출하지 마세요.");
    advice.push("통화를 끊고, 기관 공식 대표번호로 직접 다시 전화해 확인하세요.");
  }
  if (cats.has("원격제어·악성앱 설치 유도")) {
    advice.push("상대가 안내한 앱·링크는 설치하거나 누르지 마세요. 이미 설치했다면 즉시 삭제하고 기기를 비행기모드로 전환하세요.");
  }
  if (cats.has("통제·고립 발화")) {
    advice.push("'말하지 말라'는 요구는 무시하고, 가족이나 가까운 사람에게 상황을 알리세요.");
  }
  if (cats.has("개인정보 요구")) {
    advice.push("주민등록번호·카드번호·비밀번호는 어떤 기관에도 전화로 알려주지 마세요.");
  }
  if (advice.length === 0) {
    advice.push("현재 특별히 중단할 행동은 없습니다. 다만 금전 요구가 나오면 즉시 다시 확인하세요.");
  }
  return advice.slice(0, 4);
}
