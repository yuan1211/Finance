"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useCase } from "@/lib/case-store";
import { buildCalmScript, buildGuardianSteps } from "@/lib/guardian";
import { DEMO_SCRIPTS, parseScriptText, type DemoScript, type ScriptLine } from "@/lib/demo-scripts";
import { createRecognizer, isSpeechSupported, speechFatalMessage, type Recognizer } from "@/lib/speech";
import { cancelSpeech, isTtsSupported, speak, warmUpVoices } from "@/lib/speech-out";
import {
  describeNonverbal,
  hasPressurePattern,
  startAudioMeter,
  type AudioMeter,
  type NonverbalSignals,
} from "@/lib/audio-meter";
import {
  CounterScriptCard,
  InterventionBanner,
  LivePrivacyNotice,
  NonverbalPanel,
  RiskGauge,
  StageTracker,
  TranscriptFeed,
  VoiceToggle,
  formatClock,
} from "@/components/live-ui";
import { GuardianBot } from "@/components/guardian-bot";
import { EngineBadge, Panel, PrimaryButton, ScoreBreakdownCard, SectionTitle } from "@/components/ui";
import { FlowSteps } from "@/components/shell";
import type {
  DetectedSignal,
  LiveRiskUpdate,
  RiskAnalysis,
  RiskLevel,
  RiskTrend,
  ScamStage,
  ScamType,
  ScoreBreakdown,
  SpeakerTag,
  TranscriptSegment,
} from "@/lib/types";

type Phase = "idle" | "running" | "ended";
type Source = "mic" | "demo";

/** 디바운스 기준: 글자가 이만큼 쌓이면 바로 분석한다 */
const CHARS_TRIGGER = 60;
/** 글자가 적더라도 이 시간이 지나면 분석한다 */
const TIME_TRIGGER_MS = 7000;
const MIN_CHARS_FOR_TIME_TRIGGER = 12;

interface RiskState {
  score: number;
  level: RiskLevel;
  trend: RiskTrend;
  scamType: ScamType;
  scamStage: ScamStage;
  predictedNextMove: string;
  counterQuestions: string[];
  scoreBreakdown?: ScoreBreakdown;
  reason: string;
  liveMessage: string;
  engine: "claude" | "fallback";
}

/** 지원 여부는 세션 중에 바뀌지 않으므로 구독할 것이 없다 */
const subscribeNever = () => () => {};
const getServerSupported = (): boolean | null => null;

const INITIAL_RISK: RiskState = {
  score: 0,
  level: "낮음",
  trend: "유지",
  scamType: "판단 보류",
  scamStage: "미확인",
  predictedNextMove: "조금 더 들어봐야 합니다. 상대가 어떤 요구를 하는지 지켜보겠습니다.",
  counterQuestions: [],
  reason: "아직 분석할 발화가 쌓이지 않았습니다.",
  liveMessage: "듣고 있겠습니다. 이상한 요구가 나오면 바로 알려드릴게요.",
  engine: "fallback",
};

export default function LivePage() {
  const router = useRouter();
  const { setInput, setAnalysis, contacts } = useCase();

  // 브라우저 지원 여부는 렌더 밖 환경값이다. 서버 렌더에서는 null(확인 중)로 둔다.
  const supported = useSyncExternalStore(subscribeNever, isSpeechSupported, getServerSupported);

  const [phase, setPhase] = useState<Phase>("idle");
  const [source, setSource] = useState<Source>("mic");
  const [listening, setListening] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [fatal, setFatal] = useState<string | null>(null);

  const [callerNumber, setCallerNumber] = useState("");
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [interim, setInterim] = useState("");
  const [risk, setRisk] = useState<RiskState>(INITIAL_RISK);
  const [signals, setSignals] = useState<DetectedSignal[]>([]);
  const [history, setHistory] = useState<{ at: number; riskScore: number }[]>([]);
  const [bannerOpen, setBannerOpen] = useState(false);
  /** 위험도 '높음'에서 화면을 덮는 도우미봇 */
  const [guardOpen, setGuardOpen] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [demoLabel, setDemoLabel] = useState<string | null>(null);
  const [demoDone, setDemoDone] = useState(false);
  const [keepTranscript, setKeepTranscript] = useState(false);
  const [voiceOn, setVoiceOn] = useState(false);
  const [nonverbal, setNonverbal] = useState<NonverbalSignals | null>(null);

  // 렌더와 무관하게 최신값을 읽어야 하는 것들 (디바운스 타이머·인식 콜백에서 사용)
  const startedAtRef = useRef(0);
  const transcriptRef = useRef("");
  const pendingRef = useRef("");
  const analyzingRef = useRef(false);
  const lastRunRef = useRef(0);
  const riskRef = useRef<{
    score: number | null;
    level: RiskLevel | null;
    stage: ScamStage | null;
    keywords: string[];
  }>({ score: null, level: null, stage: null, keywords: [] });
  const callerRef = useRef("");
  const dismissedScoreRef = useRef(-1);
  const recognizerRef = useRef<Recognizer | null>(null);
  const demoTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  /** 음성 안내가 나가는 동안에는 마이크 인식 결과를 버린다 (스피커 → 마이크 되먹임 방지) */
  const speakingRef = useRef(false);
  const voiceOnRef = useRef(false);
  const lastSpokenRef = useRef("");
  const meterRef = useRef<AudioMeter | null>(null);
  const spokenCharsRef = useRef(0);

  /* ---------------- 세션 리셋 / 경과 시간 ---------------- */

  const clearTimers = useCallback(() => {
    for (const t of demoTimersRef.current) clearTimeout(t);
    demoTimersRef.current = [];
    recognizerRef.current?.stop();
    recognizerRef.current = null;
    cancelSpeech();
    speakingRef.current = false;
    meterRef.current?.stop();
    meterRef.current = null;
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  useEffect(() => {
    warmUpVoices();
  }, []);

  // 토글 상태를 ref에도 반영해, 렌더 밖(분석 콜백)에서도 최신값을 읽을 수 있게 한다
  useEffect(() => {
    voiceOnRef.current = voiceOn;
    if (!voiceOn) cancelSpeech();
  }, [voiceOn]);

  /** 음성 안내 1건 재생. 재생 중에는 마이크 입력을 버린다 */
  const announce = useCallback((text: string) => {
    if (!voiceOnRef.current || !text.trim() || text === lastSpokenRef.current) return;
    lastSpokenRef.current = text;
    speak(text, {
      onStart: () => {
        speakingRef.current = true;
      },
      onEnd: () => {
        // 잔향이 인식되는 것을 막기 위해 조금 여유를 두고 푼다
        setTimeout(() => {
          speakingRef.current = false;
        }, 600);
      },
    });
  }, []);

  /** 사용자가 직접 누른 읽기 요청. 음성 안내 토글과 무관하게 읽어 준다. */
  const speakNow = useCallback((text: string) => {
    if (!text.trim()) return;
    lastSpokenRef.current = text;
    speak(text, {
      onStart: () => {
        speakingRef.current = true;
      },
      onEnd: () => {
        setTimeout(() => {
          speakingRef.current = false;
        }, 600);
      },
    });
  }, []);

  useEffect(() => {
    if (phase !== "running") return;
    const id = setInterval(() => setElapsed(Date.now() - startedAtRef.current), 500);
    return () => clearInterval(id);
  }, [phase]);

  /* ---------------- 트랜스크립트 누적 ---------------- */

  const addSegment = useCallback((speaker: SpeakerTag, text: string) => {
    const clean = text.trim();
    if (!clean) return;
    const at = Date.now() - startedAtRef.current;
    const tag = speaker === "나" ? "[나]" : speaker === "상대" ? "[상대]" : "[통화]";
    transcriptRef.current += `${tag} ${clean}\n`;
    pendingRef.current += ` ${clean}`;
    setSegments((prev) => [...prev, { id: `${at}-${prev.length}`, at, speaker, text: clean }]);
  }, []);

  /* ---------------- 실시간 위험도 분석 ---------------- */

  const applyUpdate = useCallback((update: LiveRiskUpdate) => {
    setRisk({
      score: update.riskScore,
      level: update.riskLevel,
      trend: update.trend,
      scamType: update.scamType,
      scamStage: update.scamStage,
      predictedNextMove: update.predictedNextMove,
      counterQuestions: update.counterQuestions,
      scoreBreakdown: update.scoreBreakdown,
      reason: update.reason,
      liveMessage: update.liveMessage,
      engine: update.engine,
    });
    setHistory((prev) => [...prev, { at: Date.now() - startedAtRef.current, riskScore: update.riskScore }]);

    if (update.newSignals.length > 0) {
      setSignals((prev) => {
        const seen = new Set(prev.map((s) => s.keyword));
        return [...prev, ...update.newSignals.filter((s) => !seen.has(s.keyword))];
      });
    }

    riskRef.current = {
      score: update.riskScore,
      level: update.riskLevel,
      stage: update.scamStage,
      keywords: Array.from(
        new Set([...riskRef.current.keywords, ...update.newSignals.map((s) => s.keyword)]),
      ).slice(0, 40),
    };

    // 사용자가 "계속 듣기"로 닫았다면, 위험도가 더 올라갈 때만 다시 띄운다
    if (update.shouldIntervene && update.riskScore > dismissedScoreRef.current) {
      // '높음'에서는 배너로 부족하다. 화면을 덮고 다음 행동을 멈춰 세운다.
      if (update.riskLevel === "높음") {
        setBannerOpen(false);
        setGuardOpen(true);
      } else {
        setBannerOpen(true);
      }
    }

    // 개입이 필요한 순간에만 소리를 낸다. 매번 읽으면 통화를 방해한다.
    if (update.shouldIntervene) {
      announce(update.liveMessage);
    }
  }, [announce]);

  const runAnalysis = useCallback(
    async (force = false) => {
      if (analyzingRef.current) return;
      const consumed = pendingRef.current.trim();
      const transcript = transcriptRef.current.trim();
      if (transcript.length < 5) return;
      if (!force && consumed.length === 0) return;

      analyzingRef.current = true;
      pendingRef.current = "";
      lastRunRef.current = Date.now();
      setAnalyzing(true);

      // 비언어 지표는 매 분석 직전에 다시 읽는다 (표본이 계속 쌓이므로)
      const measured =
        meterRef.current?.read(spokenCharsRef.current, Date.now() - startedAtRef.current) ?? null;
      if (measured) setNonverbal(measured);

      try {
        const res = await fetch("/api/live-analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            transcript,
            recentText: consumed,
            previousLevel: riskRef.current.level,
            previousScore: riskRef.current.score,
            knownKeywords: riskRef.current.keywords,
            previousStage: riskRef.current.stage,
            // 압박 패턴이 실제로 보일 때만 보낸다. 평범한 수치까지 넘기면 프롬프트만 길어진다.
            nonverbal: measured && hasPressurePattern(measured) ? describeNonverbal(measured) : undefined,
            callerNumber: callerRef.current,
          }),
        });
        if (!res.ok) throw new Error("live analyze failed");
        applyUpdate((await res.json()) as LiveRiskUpdate);
      } catch {
        // 실패한 구간은 버리지 않고 다음 주기에 다시 함께 보낸다
        pendingRef.current = `${consumed} ${pendingRef.current}`.trim();
      } finally {
        analyzingRef.current = false;
        setAnalyzing(false);
      }
    },
    [applyUpdate],
  );

  // 디바운스 루프: 문장마다 호출하지 않고 글자수/시간 기준으로만 부른다
  useEffect(() => {
    if (phase !== "running") return;
    const id = setInterval(() => {
      const pending = pendingRef.current.trim().length;
      if (pending === 0) return;
      const since = Date.now() - lastRunRef.current;
      if (pending >= CHARS_TRIGGER || (since >= TIME_TRIGGER_MS && pending >= MIN_CHARS_FOR_TIME_TRIGGER)) {
        void runAnalysis();
      }
    }, 1500);
    return () => clearInterval(id);
  }, [phase, runAnalysis]);

  /* ---------------- 세션 시작 / 종료 ---------------- */

  const beginSession = useCallback(
    (src: Source) => {
      clearTimers();
      startedAtRef.current = Date.now();
      transcriptRef.current = "";
      pendingRef.current = "";
      lastRunRef.current = Date.now();
      analyzingRef.current = false;
        riskRef.current = { score: null, level: null, stage: null, keywords: [] };
      dismissedScoreRef.current = -1;

      setSegments([]);
      setInterim("");
      setSignals([]);
      setHistory([]);
      setRisk(INITIAL_RISK);
      setBannerOpen(false);
      setElapsed(0);
      setDemoDone(false);
      setKeepTranscript(false);
      setFatal(null);
      setSource(src);
      lastSpokenRef.current = "";
      spokenCharsRef.current = 0;
      setNonverbal(null);
      // 데모 모드는 마이크를 쓰지 않아 되먹임 위험이 없으므로 음성 안내를 기본으로 켠다
      setVoiceOn(isTtsSupported() && src === "demo");
      setPhase("running");
    },
    [clearTimers],
  );

  const startMic = useCallback(() => {
    if (!isSpeechSupported()) {
      setFatal(speechFatalMessage("unsupported"));
      return;
    }
    callerRef.current = callerNumber;
    setDemoLabel(null);
    beginSession("mic");

    const rec = createRecognizer({
      onFinal: (text) => {
        // 우리 스피커에서 나간 안내 음성이 다시 잡힌 것이면 버린다
        if (speakingRef.current) return;
        addSegment("미상", text);
      },
      onInterim: setInterim,
      onListening: setListening,
      onFatal: (reason) => {
        setFatal(speechFatalMessage(reason));
        setListening(false);
        recognizerRef.current = null;
        setPhase("ended");
        void runAnalysis(true);
      },
    });
    recognizerRef.current = rec;
    rec?.start();

    // 음량 측정은 보조 기능이다. 실패해도 인식 흐름은 그대로 간다.
    void startAudioMeter().then((meter) => {
      if (!meter) return;
      // 미터가 붙기 전에 사용자가 이미 종료했다면 바로 정리한다
      if (recognizerRef.current) meterRef.current = meter;
      else meter.stop();
    });
  }, [addSegment, beginSession, callerNumber, runAnalysis]);

  /**
   * 대본 재생. 재귀 호출 대신 시작 시점에 전체 스케줄을 한 번에 깔아 둔다.
   * (중간에 종료하면 clearTimers가 예약된 타이머를 모두 취소한다)
   */
  const playScript = useCallback(
    (lines: ScriptLine[]) => {
      let offset = 0;
      lines.forEach((line, i) => {
        demoTimersRef.current.push(
          setTimeout(() => {
            addSegment(line.speaker, line.text);
            if (i === lines.length - 1) {
              demoTimersRef.current.push(
                setTimeout(() => {
                  setDemoDone(true);
                  setListening(false);
                  void runAnalysis(true);
                }, 1200),
              );
            }
          }, offset),
        );
        offset += line.gapMs;
      });
    },
    [addSegment, runAnalysis],
  );

  const startDemo = useCallback(
    (script: DemoScript) => {
      callerRef.current = script.callerNumber;
      setCallerNumber(script.callerNumber);
      setDemoLabel(script.label);
      beginSession("demo");
      setListening(true);
      playScript(script.lines);
    },
    [beginSession, playScript],
  );

  const startUploadedScript = useCallback(
    async (file: File) => {
      const text = await file.text();
      const lines = parseScriptText(text);
      if (lines.length === 0) {
        setFatal("대본에서 읽을 수 있는 줄을 찾지 못했습니다. 한 줄에 한 발화씩 적어 주세요.");
        return;
      }
      callerRef.current = callerNumber;
      setDemoLabel(`업로드 대본 · ${file.name}`);
      beginSession("demo");
      setListening(true);
      playScript(lines);
    },
    [beginSession, callerNumber, playScript],
  );

  const stopSession = useCallback(async () => {
    clearTimers();
    setListening(false);
    setInterim("");
    setElapsed(Date.now() - startedAtRef.current);
    setPhase("ended");
    setBannerOpen(false);
    // 요청이 하나 떠 있으면 runAnalysis가 그냥 반환해 버려 마지막 발화가 빠진다.
    // 짧게 기다렸다가 남은 구간까지 확실히 반영한다.
    for (let i = 0; i < 40 && analyzingRef.current; i += 1) {
      await new Promise((r) => setTimeout(r, 150));
    }
    await runAnalysis(true);
  }, [clearTimers, runAnalysis]);

  /* ---------------- 케이스로 넘기기 ---------------- */

  const buildRedacted = useCallback(() => {
    const lines = [
      "[실시간 통화 분석 요약 — 사용자가 원문 삭제를 선택했습니다]",
      `통화 길이 ${formatClock(elapsed)}, 인식된 발화 ${segments.length}건.`,
      `최종 위험도 ${risk.level} (${risk.score}점), 의심 유형 ${risk.scamType}.`,
      `도달한 시나리오 단계: ${risk.scamStage}. ${risk.predictedNextMove}`,
    ];
    if (signals.length > 0) {
      lines.push("위험 신호로 지목된 문구:");
      for (const s of signals) lines.push(`- "${s.keyword}" (${s.category}) — ${s.explanation}`);
    }
    lines.push(`판단 근거: ${risk.reason}`);
    return lines.join("\n");
  }, [elapsed, risk, segments.length, signals]);

  const commitAndGo = useCallback(
    (target: "/result" | "/verify", withTranscript: boolean) => {
      const content = withTranscript ? transcriptRef.current.trim() : buildRedacted();
      const analysis: RiskAnalysis = {
        riskLevel: risk.level,
        riskScore: risk.score,
        scamType: risk.scamType,
        detectedSignals: signals.slice(0, 8),
        reasoning: `실시간 통화 분석 결과입니다. ${formatClock(elapsed)} 동안 ${segments.length}건의 발화를 인식했고, ${signals.length}건의 위험 신호가 확인되었습니다. 사기 시나리오는 '${risk.scamStage}' 단계까지 진행되었습니다. ${risk.reason}`,
        immediateAdvice: buildAdvice(risk.level, signals, risk.counterQuestions),
        scoreBreakdown: risk.scoreBreakdown,
        calmMessage: risk.liveMessage,
        engine: risk.engine,
      };
      setInput({
        channel: "통화",
        content: content || "실시간 통화에서 인식된 내용이 없습니다.",
        callerNumber,
        claimedOrg: "",
        accountNumber: "",
      });
      setAnalysis(analysis);
      router.push(target);
    },
    [buildRedacted, callerNumber, elapsed, risk, router, segments.length, setAnalysis, setInput, signals],
  );

  /* ---------------- 도우미봇 ---------------- */

  const calmLines = useMemo(
    () => buildCalmScript(risk.level, risk.scamStage),
    [risk.level, risk.scamStage],
  );

  const guardSteps = useMemo(
    () =>
      buildGuardianSteps({
        // 기관 대표번호 대조는 통화 원문에서 바로 찾는다 (역검증 화면으로 넘어가지 않아도 되도록)
        transcript: segments.map((s) => s.text).join(" "),
        scamType: risk.scamType,
        signals,
        counterQuestions: risk.counterQuestions,
        contacts,
        callerNumber,
      }),
    [segments, risk.scamType, risk.counterQuestions, signals, contacts, callerNumber],
  );

  /* ---------------- 렌더 ---------------- */

  const running = phase === "running";

  return (
    <div className="mx-auto max-w-5xl px-4 py-5 @md:px-5 @md:py-10">
      <GuardianBot
        open={guardOpen}
        level={risk.level}
        score={risk.score}
        liveMessage={risk.liveMessage}
        calmLines={calmLines}
        steps={guardSteps}
        onSpeak={speakNow}
        onVerify={() => {
          clearTimers();
          setListening(false);
          setGuardOpen(false);
          // 역검증에는 통화 내용이 필요하므로 원문을 함께 넘긴다 (브라우저 세션 저장소에만 보관)
          commitAndGo("/verify", true);
        }}
        onDismiss={() => {
          dismissedScoreRef.current = risk.score;
          setGuardOpen(false);
        }}
      />

      <FlowSteps />
      <SectionTitle
        eyebrow="STEP 01 · 감지 (실시간)"
        title="통화를 들으면서 함께 판단하겠습니다"
        desc="의심되는 전화를 스피커폰으로 바꾸고 아래 버튼을 누르세요. 들리는 말을 실시간으로 받아 적으면서 위험 신호가 나타나는 순간 알려드립니다."
      />

      {bannerOpen && running && (
        <InterventionBanner
          level={risk.level}
          message={risk.liveMessage}
          onVerify={() => {
            clearTimers();
            setListening(false);
            // 역검증에는 통화 내용이 필요하므로 원문을 함께 넘긴다 (브라우저 세션 저장소에만 보관)
            commitAndGo("/verify", true);
          }}
          onDismiss={() => {
            dismissedScoreRef.current = risk.score;
            setBannerOpen(false);
          }}
        />
      )}

      {fatal && (
        <p className="mb-4 rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm leading-relaxed text-danger">
          {fatal}
        </p>
      )}

      {phase === "idle" && (
        <IdlePanel
          supported={supported}
          callerNumber={callerNumber}
          onCallerChange={setCallerNumber}
          onStartMic={startMic}
          onStartDemo={startDemo}
          onUpload={startUploadedScript}
        />
      )}

      {phase !== "idle" && (
        <Panel className="mb-4 p-5">
          <StageTracker stage={risk.scamStage} predictedNextMove={risk.predictedNextMove} />
        </Panel>
      )}

      {phase !== "idle" && risk.counterQuestions.length > 0 && (
        <Panel className="mb-4 border-brand/30 p-5">
          <CounterScriptCard
            questions={risk.counterQuestions}
            onSpeak={voiceOn ? (t) => announce(t) : undefined}
          />
        </Panel>
      )}

      {phase !== "idle" && (
        <div className="grid gap-4 @5xl:grid-cols-[1fr_320px]">
          {/* 실시간 자막 — 모바일에서는 위험도 아래로 내린다 */}
          <Panel className="order-2 flex max-h-60 min-h-[9.5rem] flex-col overflow-hidden @md:max-h-[26rem] @md:min-h-[17rem] @5xl:order-1 @5xl:max-h-[35rem] @5xl:min-h-[21rem]">
            <div className="flex items-center justify-between gap-3 border-b border-line/70 px-5 py-3">
              <div className="flex items-center gap-2.5">
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    running && listening ? "bg-danger pb-pulse" : running ? "bg-warn" : "bg-line"
                  }`}
                  aria-hidden
                />
                <span className="text-sm font-bold text-white">
                  {phase === "ended"
                    ? "세션 종료됨"
                    : listening
                      ? source === "demo"
                        ? "데모 대본 재생 중"
                        : "듣는 중"
                      : demoDone
                        ? "대본 재생 완료"
                        : "연결 중…"}
                </span>
                {demoLabel && (
                  <span className="rounded-md bg-warn/12 px-2 py-0.5 text-[11px] font-semibold text-warn ring-1 ring-warn/25">
                    데모
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <VoiceToggle
                  on={voiceOn}
                  onChange={setVoiceOn}
                  disabled={!isTtsSupported()}
                  hint={
                    isTtsSupported()
                      ? source === "mic"
                        ? "켜면 경고를 소리로 읽어줍니다. 스피커 소리가 마이크에 다시 잡히지 않도록 안내 중에는 인식을 잠시 멈춥니다."
                        : "켜면 경고를 소리로 읽어줍니다."
                      : "이 브라우저는 음성 출력을 지원하지 않습니다."
                  }
                />
                <span className="font-mono text-xs text-fog">{formatClock(elapsed)}</span>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              <TranscriptFeed segments={segments} interim={interim} signals={signals} />
            </div>

            <div className="flex flex-wrap items-center gap-2 border-t border-line/70 px-5 py-3">
              {running ? (
                <PrimaryButton
                  tone="danger"
                  onClick={() => void stopSession()}
                  className="min-h-11 flex-1 px-4 py-2.5 text-sm @md:flex-none @md:text-xs"
                >
                  통화 감지 종료
                </PrimaryButton>
              ) : (
                <PrimaryButton tone="ghost" onClick={() => setPhase("idle")} className="px-4 py-2.5 text-xs">
                  다시 시작
                </PrimaryButton>
              )}
              {demoDone && running && (
                <span className="text-xs text-fog">대본 재생이 끝났습니다. 종료를 눌러 정리해 보세요.</span>
              )}
              {source === "demo" && running && !demoDone && (
                <span className="text-xs text-fog">대본이 자동으로 재생됩니다.</span>
              )}
            </div>
          </Panel>

          {/* 위험도 — 가장 먼저 눈에 들어와야 하는 정보 */}
          <div className="order-1 space-y-4 @5xl:order-2">
            <Panel className="p-5">
              <RiskGauge
                score={risk.score}
                level={risk.level}
                trend={risk.trend}
                history={history}
                analyzing={analyzing}
              />
              <div className="mt-4 flex items-center justify-between gap-2 border-t border-line/60 pt-3">
                <span className="text-[11px] font-semibold text-fog">의심 유형 · {risk.scamType}</span>
                {history.length > 0 && <EngineBadge engine={risk.engine} />}
              </div>
              <p className="mt-3 hidden text-[13px] leading-relaxed text-mist @md:block">{risk.reason}</p>
            </Panel>

            {/*
              비언어 지표와 점수 분해는 "왜 그렇게 판단했나"에 대한 근거다.
              통화 중에 읽을 것이 아니므로 접어 둔다. 끝난 뒤에는 얼마든지 펼쳐 볼 수 있다.
            */}
            {(source === "mic" || risk.scoreBreakdown) && (
              <Panel className="px-5 py-3.5">
                <details>
                  <summary className="cursor-pointer list-none text-[12px] font-semibold text-fog transition hover:text-brand">
                    판단 근거 보기
                  </summary>
                  <div className="mt-3 space-y-4">
                    {source === "mic" && <NonverbalPanel signals={nonverbal} />}
                    {risk.scoreBreakdown && (
                      <ScoreBreakdownCard
                        breakdown={risk.scoreBreakdown}
                        finalScore={risk.score}
                        engine={risk.engine}
                      />
                    )}
                  </div>
                </details>
              </Panel>
            )}

            {/* 어떤 말이 걸렸는지는 한눈에 보여야 하지만, 분류와 설명까지는 통화 중에 필요 없다 */}
            {signals.length > 0 && (
              <Panel className="px-5 py-4">
                <p className="mb-2.5 text-[11px] font-bold tracking-[0.18em] text-fog uppercase">
                  걸린 말 · {signals.length}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {signals.map((s, i) => (
                    <span
                      key={`${s.keyword}-${i}`}
                      className="pb-fade rounded-lg bg-danger/12 px-2.5 py-1 text-[12px] font-bold text-danger ring-1 ring-danger/25"
                      title={`${s.category} — ${s.explanation}`}
                    >
                      {s.keyword}
                    </span>
                  ))}
                </div>
                <details className="mt-3">
                  <summary className="cursor-pointer list-none text-[12px] font-semibold text-fog transition hover:text-brand">
                    각 신호가 왜 위험한지
                  </summary>
                  <ul className="mt-2 space-y-2">
                    {signals.map((s, i) => (
                      <li key={`d-${s.keyword}-${i}`} className="rounded-xl bg-ink/60 p-3 ring-1 ring-line">
                        <p className="text-[12px] font-bold text-danger">&ldquo;{s.keyword}&rdquo;</p>
                        <p className="mt-1 text-[12px] leading-relaxed text-mist">{s.explanation}</p>
                      </li>
                    ))}
                  </ul>
                </details>
              </Panel>
            )}
          </div>
        </div>
      )}

      {phase === "ended" && (
        <Panel className="mt-4 p-6">
          <h2 className="text-lg font-bold text-white">이제 어떻게 할까요?</h2>
          <p className="mt-1.5 text-[13px] leading-relaxed text-mist">
            위험도 {risk.level} {risk.score}점 · {risk.scamStage} 단계 · {formatClock(elapsed)}
          </p>
          <p className="mt-2.5 text-[13px] text-fog">통화 원문을 남길까요?</p>

          <fieldset className="mt-5 space-y-2">
            <legend className="sr-only">통화 원문 저장 여부</legend>
            <SaveOption
              checked={!keepTranscript}
              onSelect={() => setKeepTranscript(false)}
              title="원문은 삭제하고 요약만 남기기"
              desc="위험 신호로 지목된 문구와 분석 결과만 다음 단계로 넘깁니다. 기본값입니다."
              badge="권장"
            />
            <SaveOption
              checked={keepTranscript}
              onSelect={() => setKeepTranscript(true)}
              title="통화 원문을 그대로 넘기기"
              desc="신고용 사실관계를 더 정확히 정리할 수 있지만, 상대방의 개인정보가 함께 남습니다. 브라우저 세션에만 저장되며 탭을 닫으면 사라집니다."
            />
          </fieldset>

          <div className="mt-6 flex flex-col gap-3 @md:flex-row">
            <PrimaryButton
              tone={risk.level === "낮음" ? "brand" : "danger"}
              onClick={() => commitAndGo("/verify", keepTranscript)}
            >
              역검증 진행하기
            </PrimaryButton>
            <PrimaryButton tone="ghost" onClick={() => commitAndGo("/result", keepTranscript)}>
              분석 결과부터 보기
            </PrimaryButton>
          </div>
        </Panel>
      )}

      <LivePrivacyNotice className="mt-6" />
    </div>
  );
}

/* ------------------------------------------------------------------ */

function SaveOption({
  checked,
  onSelect,
  title,
  desc,
  badge,
}: {
  checked: boolean;
  onSelect: () => void;
  title: string;
  desc: string;
  badge?: string;
}) {
  return (
    <label
      className={`flex cursor-pointer gap-3 rounded-xl border p-4 transition ${
        checked ? "border-brand/50 bg-brand/[0.07]" : "border-line bg-ink/50 hover:border-line"
      }`}
    >
      <input
        type="radio"
        name="keep-transcript"
        checked={checked}
        onChange={onSelect}
        className="mt-1 h-4 w-4 shrink-0 accent-[#3ba6ff]"
      />
      <span>
        <span className="flex items-center gap-2 text-sm font-bold text-white">
          {title}
          {badge && (
            <span className="rounded-md bg-safe/12 px-1.5 py-0.5 text-[10px] font-bold text-safe ring-1 ring-safe/25">
              {badge}
            </span>
          )}
        </span>
        <span className="mt-1 block text-[12px] leading-relaxed text-fog">{desc}</span>
      </span>
    </label>
  );
}

function IdlePanel({
  supported,
  callerNumber,
  onCallerChange,
  onStartMic,
  onStartDemo,
  onUpload,
}: {
  supported: boolean | null;
  callerNumber: string;
  onCallerChange: (v: string) => void;
  onStartMic: () => void;
  onStartDemo: (s: DemoScript) => void;
  onUpload: (f: File) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <div className="space-y-4">
      <Panel className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-white">실시간 감지</h2>
            <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-mist">
              통화를 <strong className="font-semibold text-white">스피커폰</strong>으로 바꿔 주세요.
              들리는 말을 받아 적으면서 위험 신호를 찾습니다.
            </p>
          </div>
          <span
            className={`rounded-md px-2 py-1 text-[11px] font-semibold ring-1 ${
              supported === null
                ? "bg-line/40 text-fog ring-line"
                : supported
                  ? "bg-safe/12 text-safe ring-safe/25"
                  : "bg-warn/12 text-warn ring-warn/25"
            }`}
          >
            {supported === null ? "브라우저 확인 중" : supported ? "음성 인식 사용 가능" : "음성 인식 미지원"}
          </span>
        </div>

        <div className="mt-5 max-w-xs">
          <label htmlFor="live-caller" className="mb-1.5 block text-xs font-semibold text-fog">
            발신번호 <span className="font-normal opacity-70">(선택 — 신고 이력 대조에 사용)</span>
          </label>
          <input
            id="live-caller"
            value={callerNumber}
            onChange={(e) => onCallerChange(e.target.value)}
            placeholder="010-0000-0000"
            className="w-full rounded-xl border border-line bg-ink/70 px-3.5 py-2.5 text-sm text-white placeholder:text-fog/50 outline-none transition focus:border-brand/60 focus:ring-2 focus:ring-brand/20"
          />
        </div>

        <div className="mt-5 flex flex-col gap-3 @md:flex-row @md:items-center">
          <PrimaryButton
            tone="danger"
            onClick={onStartMic}
            disabled={supported === false}
            className="min-h-12 w-full text-base @md:w-auto @md:min-w-48 @md:text-sm"
          >
            통화 감지 시작
          </PrimaryButton>
          <p className="text-xs leading-relaxed text-fog">
            {supported === false
              ? "이 브라우저는 실시간 음성 인식을 지원하지 않습니다. 아래 데모 모드로 동일한 흐름을 확인하실 수 있습니다."
              : "누르면 마이크 권한을 한 번 요청합니다. 언제든 종료할 수 있습니다."}
          </p>
        </div>
      </Panel>

      <Panel className="p-6">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-bold text-white">데모 모드</h2>
          <span className="rounded-md bg-warn/12 px-2 py-0.5 text-[11px] font-semibold text-warn ring-1 ring-warn/25">
            마이크 없이 시연
          </span>
        </div>
        <p className="mt-1.5 text-sm leading-relaxed text-mist">
          마이크를 쓸 수 없는 환경(권한 차단, 조용한 심사장, Chrome 계열이 아닌 브라우저)을 위한 모드입니다.
          미리 준비한 통화 대본이 실제 통화 속도로 재생되며,{" "}
          <strong className="font-semibold text-white">마이크 인식과 완전히 같은 분석 경로</strong>를 그대로
          지납니다.
        </p>

        <ul className="mt-5 space-y-2.5">
          {DEMO_SCRIPTS.map((s) => (
            <li
              key={s.id}
              className="flex flex-col gap-3 rounded-xl border border-line bg-ink/50 p-4 @md:flex-row @md:items-center @md:justify-between"
            >
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-bold text-white">
                  {s.label}
                  <span
                    className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold whitespace-nowrap ring-1 ${
                      s.expected === "높음"
                        ? "bg-danger/12 text-danger ring-danger/25"
                        : s.expected === "중간"
                          ? "bg-warn/12 text-warn ring-warn/25"
                          : "bg-safe/12 text-safe ring-safe/25"
                    }`}
                  >
                    예상 {s.expected}
                  </span>
                </p>
                <p className="mt-1 text-[12px] leading-relaxed text-fog">{s.desc}</p>
              </div>
              <button
                type="button"
                onClick={() => onStartDemo(s)}
                className="shrink-0 rounded-xl border border-line bg-ink-2/60 px-4 py-2.5 text-xs font-bold text-mist transition hover:border-brand/50 hover:text-white"
              >
                재생하기
              </button>
            </li>
          ))}
        </ul>

        <div className="mt-5 border-t border-line/60 pt-4">
          <p className="text-xs leading-relaxed text-fog">
            직접 만든 대본으로 시연하려면 <code className="text-mist">상대: 발화</code> /{" "}
            <code className="text-mist">나: 발화</code> 형식의 텍스트 파일을 올리세요. 접두어가 없는 줄은
            상대방 발화로 처리합니다.
          </p>
          <input
            ref={fileRef}
            type="file"
            accept=".txt,text/plain"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onUpload(f);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="mt-3 rounded-xl border border-line bg-ink-2/60 px-4 py-2.5 text-xs font-bold text-mist transition hover:border-brand/50 hover:text-white"
          >
            대본 파일 올리기 (.txt)
          </button>
        </div>
      </Panel>

      <p className="rounded-xl border border-line/70 bg-ink-2/50 px-4 py-3 text-xs leading-relaxed text-fog">
        <span className="font-semibold text-mist">범위 안내</span> · 이동통신 회선의 통화 오디오는 iOS·Android
        정책상 앱이 직접 가져올 수 없습니다. 그래서 이 MVP는 스피커폰 + 기기 마이크로 소리를 받는 방식을
        씁니다. 통신사 연동(방식 B)은 현재 구현 범위에 포함되어 있지 않습니다. 텍스트로 정리해서 분석받고
        싶으시면{" "}
        <Link href="/check" className="font-semibold text-brand underline underline-offset-4">
          상황 입력 화면
        </Link>
        을 이용하세요.
      </p>
    </div>
  );
}

/** 실시간 결과를 기존 4단계 흐름의 RiskAnalysis 형태로 옮길 때 쓰는 즉시 조치 안내 */
function buildAdvice(level: RiskLevel, signals: DetectedSignal[], counterQuestions: string[]): string[] {
  const cats = new Set(signals.map((s) => s.category));
  const advice: string[] = [];

  if (counterQuestions.length > 0) {
    advice.push(`다시 통화하게 되면 이렇게 되물어 보세요 — "${counterQuestions[0]}"`);
  }

  if (level !== "낮음") {
    advice.push("지금은 어떤 금액도 이체하거나 인출하지 마세요.");
    advice.push("통화를 끊고, 기관 공식 대표번호로 직접 다시 전화해 확인하세요.");
  }
  if (has(cats, "원격", "앱", "링크")) {
    advice.push("상대가 안내한 앱이나 링크는 설치·클릭하지 마세요. 이미 설치했다면 즉시 삭제하세요.");
  }
  if (has(cats, "통제", "고립")) {
    advice.push("말하지 말라는 요구는 무시하고, 가족이나 가까운 사람에게 지금 상황을 알리세요.");
  }
  if (advice.length === 0) {
    advice.push("현재 특별히 중단할 행동은 없습니다. 금전 요구가 나오면 즉시 다시 확인하세요.");
  }
  return advice.slice(0, 4);
}

function has(cats: Set<string>, ...needles: string[]): boolean {
  for (const c of cats) {
    if (needles.some((n) => c.includes(n))) return true;
  }
  return false;
}
