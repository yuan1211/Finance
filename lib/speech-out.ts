"use client";

/**
 * 음성 안내 출력 (Web Speech Synthesis).
 *
 * 통화 중에는 화면을 볼 수 없다. 귀에 대고 있는 폰을 떼서 화면을 확인하는 순간
 * 상대가 눈치채기도 한다. 그래서 위험 판정과 역질문은 소리로도 전달한다.
 * 고령 사용자에게는 이쪽이 사실상 유일한 전달 경로이기도 하다.
 *
 * STT와 달리 이 API는 기기 안에서 처리되며 음성이 외부로 나가지 않는다.
 */

let cachedVoice: SpeechSynthesisVoice | null = null;
let voiceResolved = false;

export function isTtsSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/**
 * 한국어 음성을 고른다.
 * getVoices()는 처음 호출 시 빈 배열을 주는 브라우저가 있어 voiceschanged를 한 번 기다린다.
 */
function pickVoice(): SpeechSynthesisVoice | null {
  if (!isTtsSupported()) return null;
  if (voiceResolved && cachedVoice) return cachedVoice;

  const voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) return null;

  cachedVoice =
    voices.find((v) => v.lang === "ko-KR" && v.localService) ??
    voices.find((v) => v.lang === "ko-KR") ??
    voices.find((v) => v.lang.startsWith("ko")) ??
    null;
  voiceResolved = true;
  return cachedVoice;
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

  const u = new SpeechSynthesisUtterance(text);
  const voice = pickVoice();
  if (voice) u.voice = voice;
  u.lang = "ko-KR";
  // 불안한 상황에서 듣는 안내라 평소보다 조금 느리게, 또렷하게 읽는다
  u.rate = 0.95;
  u.pitch = 1;
  u.volume = 1;

  u.onstart = () => opts.onStart?.();
  u.onend = () => opts.onEnd?.();
  u.onerror = () => opts.onEnd?.();

  synth.speak(u);
}

export function cancelSpeech(): void {
  if (!isTtsSupported()) return;
  window.speechSynthesis.cancel();
}
