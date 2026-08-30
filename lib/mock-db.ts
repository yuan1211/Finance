import reported from "./mock/reported-numbers.json";
import official from "./mock/official-numbers.json";
import keywords from "./mock/risk-keywords.json";

export const reportedDb = reported;
export const officialDb = official;
export const keywordDb = keywords;

/** 전화번호를 숫자만 남겨 정규화 */
export function normalizePhone(raw?: string): string {
  return (raw ?? "").replace(/[^0-9]/g, "");
}

export interface ReportedPhoneHit {
  number: string;
  reports: number;
  lastReportedAt: string;
  type: string;
  memo: string;
}

export interface ReportedAccountHit {
  number: string;
  bank: string;
  reports: number;
  lastReportedAt: string;
  memo: string;
}

export function lookupReportedPhone(raw?: string): ReportedPhoneHit | null {
  const n = normalizePhone(raw);
  if (!n) return null;
  return reportedDb.phones.find((p) => normalizePhone(p.number) === n) ?? null;
}

export function lookupReportedAccount(raw?: string): ReportedAccountHit | null {
  const n = normalizePhone(raw);
  if (!n) return null;
  return reportedDb.accounts.find((a) => normalizePhone(a.number) === n) ?? null;
}

/** 본문에 등장하는 신고 이력 도메인 탐지 */
export function lookupReportedUrls(content: string): { domain: string; reports: number; memo: string }[] {
  const lowered = content.toLowerCase();
  return reportedDb.urls.filter((u) => lowered.includes(u.domain.toLowerCase()));
}

export interface OrgMatch {
  name: string;
  official: string[];
  category: string;
}

/** 사용자가 입력한 소속/본문에서 사칭 대상 기관을 찾는다 */
export function findOrganization(text: string): OrgMatch | null {
  if (!text) return null;
  const t = text.replace(/\s/g, "");
  for (const org of officialDb.organizations) {
    const names = [org.name, ...org.aliases];
    if (names.some((n) => t.includes(n.replace(/\s/g, "")))) {
      return { name: org.name, official: org.official, category: org.category };
    }
  }
  return null;
}

/** 발신번호가 해당 기관의 공식 대표번호와 일치하는지 */
export function matchesOfficialNumber(org: OrgMatch, phone?: string): boolean {
  const n = normalizePhone(phone);
  if (!n) return false;
  return org.official.some((o) => normalizePhone(o) === n);
}

export const helplines = officialDb.helplines;
