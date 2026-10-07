"use client";

/**
 * 음성 안내 출력 (Web Speech Synthesis).
 *
 * 통화 중에는 화면을 볼 수 없다. 귀에 대고 있는 폰을 떼서 화면을 확인하는 순간
 * 상대가 눈치채기도 한다. 그래서 위험 판정과 역질문은 소리로도 전달한다.
 * 고령 사용자에게는 이쪽이 사실상 유일한 전달 경로이기도 하다.
 *
 * 선택된 브라우저 음성에 따라 기기 또는 제공자의 음성 서비스에서 처리될 수 있다.
 */

export function isTtsSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/** Use the same Korean male voice for every spoken guide. */
function pickVoice(): SpeechSynthesisVoice | null {
  if (!isTtsSupported()) return null;
  const korean=window.speechSynthesis.getVoices().filter(v=>v.lang.startsWith("ko"));
  return korean.find(v=>/injoon|인준/i.test(v.name))
    ?? korean.find(v=>/bongjin|봉진|gookmin|국민|male|남성|남자/i.test(v.name)&&!/female/i.test(v.name))
    ?? null;
}

export function createGuidanceUtterance(text:string):SpeechSynthesisUtterance|null {
  const selected=pickVoice();
  if(!selected)return null;
  const u=new SpeechSynthesisUtterance(text);
  u.voice=selected;u.lang="ko-KR";u.rate=1.2;u.pitch=0.98;u.volume=1;
  return u;
}

/** 앱 시작 시 한 번 호출해 두면 첫 발화가 늦지 않는다 */
export function warmUpVoices(): void {
  if (!isTtsSupported()) return;
  pickVoice();
  window.speechSynthesis.addEventListener("voiceschanged", () => pickVoice(), { once: true });
}

export interface SpeakOptions {
  onStart?: () => void;
  onEnd?: () => void;
  /** 이미 재생 중인 안내를 끊고 말할지 (기본 true — 최신 경고가 항상 우선한다) */
  interrupt?: boolean;
}

/**
 * 텍스트를 읽는다.
 *
 * 주의: 마이크 인식이 켜져 있으면 스피커로 나간 이 소리가 다시 인식돼
 * 트랜스크립트를 오염시킬 수 있다. 호출하는 쪽에서 onStart/onEnd 사이에
 * 인식 결과를 무시하도록 처리해야 한다(app/live/page.tsx의 speakingRef).
 */
export function speak(text: string, opts: SpeakOptions = {}): void {
  if (!isTtsSupported() || !text.trim()) return;

  const synth = window.speechSynthesis;
  if (opts.interrupt !== false) synth.cancel();

  const u = createGuidanceUtterance(text);
  if(!u){opts.onEnd?.();return;}

  u.onstart = () => opts.onStart?.();
  u.onend = () => opts.onEnd?.();
  u.onerror = () => opts.onEnd?.();

  synth.speak(u);
}

export function cancelSpeech(): void {
  if (!isTtsSupported()) return;
  window.speechSynthesis.cancel();
}
