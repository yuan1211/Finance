import { scanKeywords } from "./fallback-analyzer";
import { lookupReportedAccount, lookupReportedPhone, lookupReportedUrls } from "./mock-db";
import type { ScoreBreakdown, ScoreFactor } from "./types";

/**
 * 점수 기여도 분해.
 *
 * "왜 82점인가"에 답하지 못하는 위험 점수는 사용자에게도 심사자에게도 근거가 되지 못한다.
 * 여기서 만드는 분해는 키워드 사전과 목업 DB만 쓰는 결정론적 계산이라, 같은 입력이면
 * 언제나 같은 결과가 나오고 손으로 검산할 수 있다.
 *
 * LLM이 최종 점수를 매긴 경우에도 이 분해는 그대로 함께 보여 준다.
 * 두 값이 다르면 그 차이 자체가 "Claude가 문맥을 보고 얼마나 조정했는가"를 말해 준다.
 */
export function buildScoreBreakdown(
  text: string,
  callerNumber?: string,
  accountNumber?: string,
): ScoreBreakdown {
  const scan = scanKeywords(text);
  const factors: ScoreFactor[] = [];

  const phoneHit = lookupReportedPhone(callerNumber);
  if (phoneHit) {
    factors.push({
      label: "신고 이력 발신번호",
      points: 35,
      detail: `${phoneHit.number} — 최근 ${phoneHit.reports}건 신고 (${phoneHit.type})`,
    });
  }

  const accountHit = lookupReportedAccount(accountNumber);
  if (accountHit) {
    factors.push({
      label: "신고 이력 계좌",
      points: 35,
      detail: `${accountHit.bank} ${accountHit.number} — ${accountHit.reports}건 신고`,
    });
  }

  for (const u of lookupReportedUrls(text)) {
    factors.push({
      label: "악성 링크",
      points: 30,
      detail: `${u.domain} — ${u.reports}건 신고`,
    });
  }

  for (const c of scan.contributions) {
    factors.push({
      label: c.label,
      points: c.points,
      detail: c.hits.map((h) => `"${h}"`).join(", "),
    });
  }

  factors.sort((a, b) => b.points - a.points);

  const subtotal = factors.reduce((sum, f) => sum + f.points, 0);
  return { factors, subtotal, capped: Math.min(100, subtotal) };
}
