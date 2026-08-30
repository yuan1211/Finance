"use client";

/**
 * Web Speech API(webkitSpeechRecognition) 얇은 래퍼.
 *
 * 왜 직접 감싸는가:
 * - Chrome의 SpeechRecognition은 침묵이 몇 초 이어지면 스스로 onend를 발생시킨다.
 *   통화 내내 끊기지 않게 하려면 "사용자가 중지를 누를 때까지" 자동 재시작해야 한다.
 * - 표준 DOM 타입 정의에 아직 포함되지 않아 최소한의 타입을 직접 선언한다.
 *
 * 개인정보 주의: Chrome 구현은 마이크 오디오를 Google 음성 인식 서버로 전송한다.
 * 이 사실은 UI에 그대로 고지한다(components/live-ui.tsx의 LivePrivacyNotice).
 */

interface SpeechAlternative {
  transcript: string;
  confidence: number;
}
interface SpeechResult {
  readonly length: number;
  isFinal: boolean;
  [index: number]: SpeechAlternative;
}
interface SpeechResultList {
  readonly length: number;
  [index: number]: SpeechResult;
}
interface SpeechRecognitionEventLike extends Event {
  resultIndex: number;
  results: SpeechResultList;
}
interface SpeechRecognitionErrorEventLike extends Event {
  error: string;
  message?: string;
}
interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** 이 브라우저에서 실시간 음성인식이 가능한지 */
export function isSpeechSupported(): boolean {
  return getCtor() !== null;
}

export type SpeechFatalReason = "permission" | "no-microphone" | "network" | "unsupported" | "unknown";

const FATAL_MESSAGE: Record<SpeechFatalReason, string> = {
  permission:
    "마이크 사용이 차단되어 있습니다. 주소창 왼쪽 자물쇠 아이콘에서 마이크를 '허용'으로 바꾼 뒤 다시 시도해 주세요.",
  "no-microphone": "마이크를 찾을 수 없습니다. 기기에 마이크가 연결되어 있는지 확인해 주세요.",
  network: "음성 인식 서버에 연결하지 못했습니다. 네트워크를 확인하거나 아래 데모 모드를 이용해 주세요.",
  unsupported:
    "이 브라우저는 실시간 음성 인식을 지원하지 않습니다. Chrome 계열 브라우저를 쓰시거나 아래 데모 모드를 이용해 주세요.",
  unknown: "음성 인식이 중단되었습니다. 다시 시도하거나 데모 모드를 이용해 주세요.",
};

export function speechFatalMessage(reason: SpeechFatalReason): string {
  return FATAL_MESSAGE[reason];
}

export interface RecognizerCallbacks {
  /** 확정된 문장 (구두점 단위로 끊겨 들어온다) */
  onFinal: (text: string) => void;
  /** 인식 중인 미확정 텍스트 — 화면에 흐릿하게 보여주는 용도 */
  onInterim: (text: string) => void;
  /** 복구 불가능한 오류. 호출 시점에 인식은 이미 멈춘 상태다 */
  onFatal: (reason: SpeechFatalReason) => void;
  /** 실제로 듣기 시작했을 때 */
  onListening?: (listening: boolean) => void;
}

export interface Recognizer {
  start(): void;
  stop(): void;
}

/**
 * 인식기를 만든다. 지원하지 않는 브라우저면 null.
 * stop()을 부르기 전까지는 브라우저가 세션을 끊어도 자동으로 다시 붙는다.
 */
export function createRecognizer(cb: RecognizerCallbacks, lang = "ko-KR"): Recognizer | null {
  const Ctor = getCtor();
  if (!Ctor) return null;

  let rec: SpeechRecognitionLike | null = null;
  let desired = false;
  let restartTimer: ReturnType<typeof setTimeout> | null = null;
  // 재시작 폭주 방지: 1초 안에 연속 재시작이 6회를 넘으면 포기한다
  let restartBurst = 0;
  let burstSince = 0;

  const build = () => {
    const r = new Ctor();
    r.lang = lang;
    r.continuous = true;
    r.interimResults = true;
    r.maxAlternatives = 1;

    r.onstart = () => {
      cb.onListening?.(true);
    };

    r.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i += 1) {
        const result = e.results[i];
        const text = result[0]?.transcript ?? "";
        if (!text) continue;
        if (result.isFinal) {
          const trimmed = text.trim();
          if (trimmed) cb.onFinal(trimmed);
        } else {
          interim += text;
        }
      }
      cb.onInterim(interim.trim());
    };

    r.onerror = (e) => {
      switch (e.error) {
        // 침묵이 길어졌을 뿐이므로 onend의 자동 재시작에 맡긴다
        case "no-speech":
        case "aborted":
          return;
        case "not-allowed":
        case "service-not-allowed":
          desired = false;
          cb.onFatal("permission");
          return;
        case "audio-capture":
          desired = false;
          cb.onFatal("no-microphone");
          return;
        case "network":
          desired = false;
          cb.onFatal("network");
          return;
        default:
          desired = false;
          cb.onFatal("unknown");
      }
    };

    r.onend = () => {
      cb.onListening?.(false);
      if (!desired) return;
      const now = Date.now();
      if (now - burstSince > 1000) {
        burstSince = now;
        restartBurst = 0;
      }
      restartBurst += 1;
      if (restartBurst > 6) {
        desired = false;
        cb.onFatal("unknown");
        return;
      }
      restartTimer = setTimeout(() => {
        if (!desired || !rec) return;
        try {
          rec.start();
        } catch {
          // 이미 시작된 상태라면 무시한다
        }
      }, 250);
    };

    return r;
  };

  return {
    start() {
      if (desired) return;
      desired = true;
      restartBurst = 0;
      burstSince = Date.now();
      rec = build();
      try {
        rec.start();
      } catch {
        desired = false;
        cb.onFatal("unknown");
      }
    },
    stop() {
      desired = false;
      if (restartTimer) clearTimeout(restartTimer);
      restartTimer = null;
      cb.onInterim("");
      if (!rec) return;
      try {
        rec.stop();
      } catch {
        // 이미 멈춘 상태
      }
      rec = null;
    },
  };
}
