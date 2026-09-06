import type { DetectedSignal, ScamType } from "./types";
import { keywordDb } from "./mock-db";

/**
 * 룰 기반 위험 신호 탐지.
 * ANTHROPIC_API_KEY가 없거나 LLM 호출이 실패해도 실시간 감지가 멈추지 않도록,
 * 키워드 사전만으로 같은 형태의 신호를 만들어 낸다.
 * 실제 위험도 산출은 lib/live-analyzer.ts, 점수 분해는 lib/score-breakdown.ts가 맡는다.
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
