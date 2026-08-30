"use client";

/**
 * 비언어 신호 측정.
 *
 * 보이스피싱범은 피해자에게 생각할 틈을 주지 않는다. 쉼 없이 말하고, 말이 빨라지고,
 * 요구 단계에서 목소리를 높인다. 이건 무슨 말을 했느냐(텍스트)로는 잡히지 않는 신호다.
 *
 * 음성 감정 인식 같은 무거운 모델 없이, 브라우저 Web Audio API만으로 셋을 잰다.
 * 지표는 어디까지나 보조 근거이며, 이것만으로 위험도를 올리지는 않는다.
 */

export interface NonverbalSignals {
  /** 말이 이어진 시간 비율 (0~1). 높을수록 쉼 없이 몰아붙인다는 뜻 */
  speechRatio: number;
  /** 가장 길게 쉼 없이 이어진 발화 (초) */
  longestRunSec: number;
  /** 최근 구간 음량이 초반 대비 몇 배인지 (1이면 변화 없음) */
  loudnessTrend: number;
  /** 분당 음절 수 — 트랜스크립트 길이와 경과 시간으로 계산 */
  syllablesPerMin: number;
  /** 측정에 쓰인 표본 수. 너무 적으면 신뢰할 수 없다 */
  samples: number;
}

export interface AudioMeter {
  stop(): void;
  /** 지금까지의 측정값. 표본이 부족하면 null */
  read(spokenChars: number, elapsedMs: number): NonverbalSignals | null;
}

const SAMPLE_MS = 100;
/** 이 값을 넘으면 '말하는 중'으로 본다. 조용한 방의 암소음보다 넉넉히 위. */
const SPEECH_FLOOR = 0.012;
/** 판단에 필요한 최소 측정 시간 */
const MIN_SAMPLES = 60;

/**
 * 마이크 스트림을 하나 더 열어 음량을 주기적으로 기록한다.
 *
 * SpeechRecognition은 내부적으로 쓰는 스트림을 노출하지 않아 별도로 열어야 한다.
 * 같은 권한을 쓰므로 사용자에게 추가 프롬프트가 뜨지는 않는다.
 * 실패하면 null을 돌려주고, 호출하는 쪽은 비언어 지표 없이 그대로 진행한다.
 */
export async function startAudioMeter(): Promise<AudioMeter | null> {
  if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia) return null;

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      // 음량 자체를 재야 하므로 자동 이득 조정은 끈다
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false },
    });
  } catch {
    return null;
  }

  const AudioCtx =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) {
    for (const t of stream.getTracks()) t.stop();
    return null;
  }

  const ctx = new AudioCtx();
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  source.connect(analyser);

  const buf = new Float32Array(analyser.fftSize);
  const levels: number[] = [];

  const timer = setInterval(() => {
    analyser.getFloatTimeDomainData(buf);
    let sum = 0;
    for (const v of buf) sum += v * v;
    levels.push(Math.sqrt(sum / buf.length));
    // 메모리가 무한히 늘지 않게 최근 30분 정도만 유지한다
    if (levels.length > 18000) levels.splice(0, levels.length - 18000);
  }, SAMPLE_MS);

  return {
    stop() {
      clearInterval(timer);
      source.disconnect();
      void ctx.close().catch(() => {});
      for (const t of stream.getTracks()) t.stop();
    },

    read(spokenChars: number, elapsedMs: number): NonverbalSignals | null {
      if (levels.length < MIN_SAMPLES) return null;

      let speaking = 0;
      let run = 0;
      let longestRun = 0;
      for (const l of levels) {
        if (l > SPEECH_FLOOR) {
          speaking += 1;
          run += 1;
          if (run > longestRun) longestRun = run;
        } else {
          run = 0;
        }
      }

      // 초반 20%와 최근 20%의 평균 음량을 비교해 추세를 본다
      const slice = Math.max(10, Math.floor(levels.length * 0.2));
      const head = levels.slice(0, slice);
      const tail = levels.slice(-slice);
      const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
      const headMean = mean(head);
      const loudnessTrend = headMean > 0.0005 ? mean(tail) / headMean : 1;

      const minutes = Math.max(elapsedMs / 60000, 1 / 60);

      return {
        speechRatio: speaking / levels.length,
        longestRunSec: (longestRun * SAMPLE_MS) / 1000,
        loudnessTrend,
        // 한국어는 글자 수가 대략 음절 수와 같다
        syllablesPerMin: spokenChars / minutes,
        samples: levels.length,
      };
    },
  };
}

/** 측정값을 사람이 읽는 한 줄로. LLM 프롬프트에도 이 문장을 그대로 넣는다. */
export function describeNonverbal(n: NonverbalSignals): string[] {
  const lines: string[] = [];

  lines.push(
    `말이 이어진 시간 비율 ${(n.speechRatio * 100).toFixed(0)}%` +
      (n.speechRatio >= 0.75 ? " — 쉼 없이 이어지고 있습니다" : ""),
  );
  lines.push(
    `가장 길게 이어진 발화 ${n.longestRunSec.toFixed(0)}초` +
      (n.longestRunSec >= 25 ? " — 끼어들 틈을 주지 않는 패턴입니다" : ""),
  );
  lines.push(
    `말 빠르기 분당 ${Math.round(n.syllablesPerMin)}음절` +
      (n.syllablesPerMin >= 380 ? " — 평균보다 빠릅니다" : ""),
  );
  if (n.loudnessTrend >= 1.35) {
    lines.push(`목소리가 초반보다 ${n.loudnessTrend.toFixed(1)}배 커졌습니다 — 압박이 강해지는 신호입니다`);
  }

  return lines;
}

/** 주의 깊게 볼 만한 패턴이 하나라도 있는지 */
export function hasPressurePattern(n: NonverbalSignals): boolean {
  return n.speechRatio >= 0.75 || n.longestRunSec >= 25 || n.syllablesPerMin >= 380 || n.loudnessTrend >= 1.35;
}
