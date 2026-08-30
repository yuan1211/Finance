/**
 * 환각 차단 레이어.
 *
 * 프롬프트로 "원문에 실제로 있는 표현만 쓰라"고 지시해도 100% 지켜지지는 않는다.
 * 위험 신호는 사용자가 "내가 정말 저런 말을 들었나"를 판단하는 근거이므로,
 * 원문에 없는 문구가 섞이면 서비스 신뢰가 통째로 무너진다.
 * 그래서 프롬프트와 별개로, 서버에서 기계적으로 한 번 더 대조해 걸러낸다.
 */

/** 비교용 정규화: 공백·구두점·대소문자 차이를 무시한다 */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\s\-–—.,()[\]{}"'“”‘’·:;!?]/g, "");
}

export interface SignalFilterResult<T> {
  kept: T[];
  /** 원문에서 찾지 못해 버린 키워드 (로그용) */
  dropped: string[];
}

/**
 * keyword가 원문(sources) 어딘가에 실제로 등장하는 신호만 남긴다.
 * 너무 짧은 키워드(1글자)는 우연히 일치하기 쉬워 근거로서 의미가 없으므로 함께 버린다.
 */
export function filterHallucinatedSignals<T extends { keyword: string }>(
  signals: T[],
  sources: (string | undefined | null)[],
): SignalFilterResult<T> {
  const haystack = normalize(sources.filter(Boolean).join(" "));
  const kept: T[] = [];
  const dropped: string[] = [];

  for (const s of signals) {
    const needle = normalize(s.keyword ?? "");
    if (needle.length >= 2 && haystack.includes(needle)) {
      kept.push(s);
    } else {
      dropped.push(s.keyword);
    }
  }

  return { kept, dropped };
}
