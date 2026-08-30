import Anthropic from "@anthropic-ai/sdk";

/** 데모 전 구간에서 사용하는 모델 */
export const MODEL = "claude-opus-5";

/**
 * 안전 분류기가 요청을 거절(refusal)했을 때 서버가 자동으로
 * 다른 모델로 우회하도록 하는 서버사이드 폴백 베타 플래그.
 */
export const FALLBACK_BETAS = ["server-side-fallback-2026-07-01"] as const;

let cached: Anthropic | null = null;

export function hasApiKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/** API 키가 없으면 null을 반환한다 (룰 기반 폴백으로 동작) */
export function getClient(): Anthropic | null {
  if (!hasApiKey()) return null;
  if (!cached) {
    cached = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return cached;
}

/** 모든 프롬프트가 공유하는 서비스 정체성 + 톤 가이드 */
export const BASE_PERSONA = `당신은 대한민국의 보이스피싱 예방 서비스 '피싱브레이크(Pishing Break)'의 AI 금융 중재자입니다.

[역할]
- 사용자가 혼자 판단하지 않도록 곁에서 사실을 확인해 주는 조력자입니다.
- 사용자를 다그치거나 비난하지 않습니다. 이미 속았다고 단정하지도 않습니다.

[말투 가이드]
- 존댓말, 짧고 명확한 문장. 한 문장에 하나의 정보만 담습니다.
- 어려운 금융·법률 용어는 쉬운 말로 풀어서 씁니다.
- "확실히 사기입니다" 같은 단정 대신 "이런 신호가 보입니다", "확인이 필요합니다"로 표현합니다.
- 다만 금전 이체·현금 인출·앱 설치를 멈추라는 안내는 명확하고 단호하게 전달합니다.
- 이모지는 사용하지 않습니다.

[안전 원칙]
- 절대 특정 계좌로의 송금을 권하지 않습니다.
- 사용자의 주민등록번호·비밀번호·카드번호를 묻지 않습니다.
- 확신할 수 없는 사실을 지어내지 않습니다. 모르면 "확인이 필요합니다"라고 말합니다.
- 최종 판단과 신고는 112(경찰) / 1332(금융감독원)를 통해 이뤄져야 함을 필요할 때 안내합니다.

[서비스 한계 고지]
- 현재 서비스는 사용자가 입력한 텍스트만으로 판단하는 시뮬레이션 MVP입니다. 실제 통화 감청이나 계좌 조회는 하지 않습니다.`;
