"use client";

import { useEffect, useMemo, useRef } from "react";
import { hasPressurePattern, type NonverbalSignals } from "@/lib/audio-meter";
import { SCAM_STAGES, STAGE_DESC } from "@/lib/types";
import type { DetectedSignal, RiskLevel, RiskTrend, ScamStage, TranscriptSegment } from "@/lib/types";

const LEVEL_TOKEN: Record<RiskLevel, { text: string; bg: string; ring: string; fill: string; icon: string }> = {
  낮음: { text: "text-safe", bg: "bg-safe/12", ring: "ring-safe/30", fill: "bg-safe", icon: "●" },
  중간: { text: "text-warn", bg: "bg-warn/12", ring: "ring-warn/30", fill: "bg-warn", icon: "▲" },
  높음: { text: "text-danger", bg: "bg-danger/12", ring: "ring-danger/35", fill: "bg-danger", icon: "■" },
};

const STROKE: Record<RiskLevel, string> = {
  낮음: "#2fbf88",
  중간: "#f5a524",
  높음: "#ff5d5d",
};

const TREND_LABEL: Record<RiskTrend, string> = { 상승: "▲ 상승", 유지: "— 유지", 하락: "▼ 하락" };

export function formatClock(ms: number): string {
  const total = Math.floor(ms / 1000);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * 실시간 위험도 미터.
 * 색만으로 상태를 구분하지 않도록 점수(숫자) + 단계 라벨 + 도형 아이콘을 함께 붙인다.
 */
export function RiskGauge({
  score,
  level,
  trend,
  history,
  analyzing,
}: {
  score: number;
  level: RiskLevel;
  trend: RiskTrend;
  history: { at: number; riskScore: number }[];
  analyzing: boolean;
}) {
  const t = LEVEL_TOKEN[level];

  return (
    <div>
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold tracking-[0.18em] text-fog uppercase">실시간 위험도</p>
          <div className="mt-1.5 flex items-baseline gap-2">
            <span className={`font-mono text-5xl leading-none font-black tabular-nums ${t.text}`}>{score}</span>
            <span className="text-sm font-semibold text-fog">/ 100</span>
          </div>
        </div>
        <div className="text-right">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-bold ring-1 ${t.bg} ${t.text} ${t.ring}`}
          >
            <span className="text-[10px]" aria-hidden>
              {t.icon}
            </span>
            위험도 {level}
          </span>
          <p className="mt-1.5 font-mono text-[11px] text-fog">{analyzing ? "분석 중…" : TREND_LABEL[trend]}</p>
        </div>
      </div>

      {/* 미터: 30/60 임계선을 눈금으로 함께 보여 준다 */}
      <div className="mt-4">
        <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-ink/80 ring-1 ring-line/70">
          <div
            className={`h-full rounded-full transition-[width] duration-700 ease-out ${t.fill}`}
            style={{ width: `${Math.max(2, score)}%` }}
          />
          <span className="absolute inset-y-0 left-[30%] w-px bg-ink/90" aria-hidden />
          <span className="absolute inset-y-0 left-[60%] w-px bg-ink/90" aria-hidden />
        </div>
        <div className="mt-1.5 flex justify-between font-mono text-[10px] text-fog">
          <span>0 낮음</span>
          <span>30 중간</span>
          <span>60 높음</span>
          <span>100</span>
        </div>
      </div>

      <RiskSparkline history={history} level={level} />
    </div>
  );
}

/** 통화가 진행되며 위험도가 어떻게 움직였는지 — 단일 계열이라 범례 대신 제목으로 대신한다 */
function RiskSparkline({ history, level }: { history: { at: number; riskScore: number }[]; level: RiskLevel }) {
  const W = 300;
  const H = 44;

  const path = useMemo(() => {
    if (history.length === 0) return null;
    const maxAt = Math.max(history[history.length - 1].at, 1);
    const pts = history.map((h, i) => {
      const raw = (h.at / maxAt) * W;
      const x = history.length === 1 ? W : Number.isFinite(raw) ? raw : (i / (history.length - 1)) * W;
      return { x, y: H - (h.riskScore / 100) * H };
    });
    return {
      d: pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" "),
      last: pts[pts.length - 1],
    };
  }, [history]);

  if (!path) {
    return (
      <p className="mt-4 border-t border-line/60 pt-3 text-[11px] text-fog">
        위험도 추이는 첫 분석이 끝나면 표시됩니다.
      </p>
    );
  }

  return (
    <figure className="mt-4 border-t border-line/60 pt-3">
      <figcaption className="mb-1.5 text-[11px] font-semibold text-fog">통화 중 위험도 추이</figcaption>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-11 w-full"
        role="img"
        aria-label={`위험도 추이. 현재 ${history[history.length - 1].riskScore}점, 위험도 ${level}`}
      >
        {/* 임계선 30(중간) / 60(높음) — 배경으로 물러나게 둔다 */}
        <line x1="0" y1={H - 0.6 * H} x2={W} y2={H - 0.6 * H} stroke="#1e2c45" strokeWidth="1" strokeDasharray="3 4" />
        <line x1="0" y1={H - 0.3 * H} x2={W} y2={H - 0.3 * H} stroke="#1e2c45" strokeWidth="1" strokeDasharray="3 4" />
        <path d={path.d} fill="none" stroke={STROKE[level]} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={path.last.x} cy={path.last.y} r="4" fill={STROKE[level]} stroke="#0d1524" strokeWidth="2" />
      </svg>
    </figure>
  );
}


/* ------------------------------------------------------------------ *
 * 시나리오 단계 트래커
 * ------------------------------------------------------------------ */

/** 단계가 진행될수록 색이 올라간다. 색만으로 읽히지 않게 단계명을 항상 함께 쓴다. */
const STAGE_TONE: Record<ScamStage, { text: string; bg: string; ring: string; dot: string }> = {
  미확인: { text: "text-fog", bg: "bg-ink/60", ring: "ring-line", dot: "bg-line" },
  접근: { text: "text-brand", bg: "bg-brand/12", ring: "ring-brand/35", dot: "bg-brand" },
  신뢰구축: { text: "text-brand", bg: "bg-brand/12", ring: "ring-brand/35", dot: "bg-brand" },
  고립: { text: "text-warn", bg: "bg-warn/12", ring: "ring-warn/40", dot: "bg-warn" },
  압박: { text: "text-warn", bg: "bg-warn/14", ring: "ring-warn/45", dot: "bg-warn" },
  편취: { text: "text-danger", bg: "bg-danger/14", ring: "ring-danger/45", dot: "bg-danger" },
};

/** 화면에 보여줄 단계는 '미확인'을 뺀 5개 */
const VISIBLE_STAGES: ScamStage[] = SCAM_STAGES.filter((s) => s !== "미확인");

export function StageTracker({
  stage,
  predictedNextMove,
}: {
  stage: ScamStage;
  predictedNextMove: string;
}) {
  const currentIndex = VISIBLE_STAGES.indexOf(stage);
  const tone = STAGE_TONE[stage];

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-[11px] font-bold tracking-[0.18em] text-fog uppercase">사기 시나리오 단계</p>
        <p className="hidden text-[11px] text-fog @md:block">
          보이스피싱은 정해진 대본을 따릅니다. 지금 어디까지 왔는지 표시합니다.
        </p>
      </div>

      <ol className="mt-3 flex items-center gap-1 overflow-x-auto pb-1">
        {VISIBLE_STAGES.map((s, i) => {
          const state = currentIndex < 0 ? "todo" : i < currentIndex ? "done" : i === currentIndex ? "active" : "todo";
          const t = STAGE_TONE[s];
          return (
            <li key={s} className="flex shrink-0 items-center gap-1">
              <div
                aria-current={state === "active" ? "step" : undefined}
                className={`flex items-center gap-1.5 rounded-full px-2 py-1.5 text-xs font-bold ring-1 transition @md:px-3 ${
                  state === "active"
                    ? `${t.bg} ${t.text} ${t.ring}`
                    : state === "done"
                      ? "bg-ink/70 text-mist ring-line"
                      : "bg-ink/40 text-fog ring-line/60"
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    state === "active" ? `${t.dot} ${s === "편취" ? "pb-pulse" : ""}` : state === "done" ? "bg-mist" : "bg-line"
                  }`}
                  aria-hidden
                />
                <span className="font-mono text-[10px] opacity-60">{`0${i + 1}`}</span>
                <span className={state === "active" ? "" : "hidden @md:inline"}>{s}</span>
              </div>
              {i < VISIBLE_STAGES.length - 1 && <span className="h-px w-3 shrink-0 bg-line" aria-hidden />}
            </li>
          );
        })}
      </ol>

      <div className="mt-3 grid gap-2 @md:grid-cols-2">
        <div className={`rounded-xl px-3.5 py-3 ring-1 ${tone.bg} ${tone.ring}`}>
          <p className={`text-[11px] font-bold tracking-wider uppercase ${tone.text}`}>현재 · {stage}</p>
          <p className="mt-1 text-[13px] leading-relaxed text-mist">{STAGE_DESC[stage]}</p>
        </div>
        <div className="rounded-xl bg-ink/60 px-3.5 py-3 ring-1 ring-line">
          <p className="text-[11px] font-bold tracking-wider text-fog uppercase">다음 예상</p>
          <p className="mt-1 text-[13px] leading-relaxed text-mist">{predictedNextMove}</p>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * 역질문 코칭 카드
 * ------------------------------------------------------------------ */

/**
 * 통화 중에 곁눈질로 보고 그대로 소리 내어 읽는 카드다.
 * 그래서 다른 어떤 요소보다 글씨가 크고, 한 줄에 한 문장만 둔다.
 */
export function CounterScriptCard({
  questions,
  onSpeak,
}: {
  questions: string[];
  /** 음성 안내가 켜져 있을 때만 전달된다 */
  onSpeak?: (text: string) => void;
}) {
  if (questions.length === 0) return null;

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-[11px] font-bold tracking-[0.18em] text-brand uppercase">
          이렇게 되물어 보세요
        </p>
        <p className="text-[11px] text-fog">진짜 기관이나 가족이라면 바로 답합니다.</p>
      </div>

      <ul className="mt-3 space-y-2">
        {questions.map((q, i) => (
          <li
            key={q}
            className="pb-fade flex items-start gap-3 rounded-xl border border-brand/25 bg-brand/[0.07] px-4 py-3.5"
          >
            <span
              className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand/15 font-mono text-[11px] font-bold text-brand"
              aria-hidden
            >
              {i + 1}
            </span>
            <p className="flex-1 text-[15px] leading-relaxed font-semibold text-white @md:text-base">
              &ldquo;{q}&rdquo;
            </p>
            {onSpeak && (
              <button
                type="button"
                onClick={() => onSpeak(q)}
                aria-label={`${i + 1}번 질문 읽어주기`}
                className="mt-0.5 shrink-0 rounded-lg border border-brand/30 px-2.5 py-1.5 font-mono text-[10px] font-bold text-brand transition hover:bg-brand/15"
              >
                읽어주기
              </button>
            )}
          </li>
        ))}
      </ul>

      <p className="mt-3 text-[11px] leading-relaxed text-fog">
        상대를 몰아붙일 필요는 없습니다. 차분하게 확인만 요청하시면 됩니다. 답을 피하거나 화를 내면 그
        자체가 신호입니다.
      </p>
    </div>
  );
}


/** 위험 신호로 지목된 문구를 원문에서 강조한다 */
function Highlighted({ text, keywords }: { text: string; keywords: string[] }) {
  const parts = useMemo(() => {
    const found = keywords.filter((k) => k.length >= 2 && text.includes(k)).sort((a, b) => b.length - a.length);
    if (found.length === 0) return [{ text, hit: false }];

    const escaped = found.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const re = new RegExp(`(${escaped.join("|")})`, "g");
    return text
      .split(re)
      .filter((s) => s.length > 0)
      .map((s) => ({ text: s, hit: found.includes(s) }));
  }, [text, keywords]);

  return (
    <>
      {parts.map((p, i) =>
        p.hit ? (
          <mark key={i} className="rounded bg-danger/20 px-0.5 font-semibold text-danger">
            {p.text}
          </mark>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </>
  );
}

/** 실시간 자막 영역. 새 발화가 들어오면 자동으로 아래를 따라간다 */
export function TranscriptFeed({
  segments,
  interim,
  signals,
}: {
  segments: TranscriptSegment[];
  interim: string;
  signals: DetectedSignal[];
}) {
  const endRef = useRef<HTMLDivElement>(null);
  const keywords = useMemo(() => signals.map((s) => s.keyword), [signals]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [segments.length, interim]);

  if (segments.length === 0 && !interim) {
    return (
      <div className="flex h-full min-h-64 items-center justify-center px-6 text-center">
        <p className="text-sm leading-relaxed text-fog">
          아직 인식된 말이 없습니다.
          <br />
          통화를 스피커폰으로 바꾸고 휴대폰을 이 기기 가까이 두세요.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2.5 px-5 py-4">
      {segments.map((s) => {
        const mine = s.speaker === "나";
        return (
          <div key={s.id} className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
            <div className="mb-1 flex items-center gap-2 px-1">
              <span className={`text-[11px] font-bold ${mine ? "text-brand" : "text-mist"}`}>
                {/* 마이크 인식은 화자를 구분하지 못하므로 '미상'은 통화 음성으로 표기한다 */}
                {mine ? "나" : s.speaker === "미상" ? "통화 음성" : "상대방"}
              </span>
              <span className="font-mono text-[10px] text-fog">{formatClock(s.at)}</span>
            </div>
            <p
              className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed ${
                mine
                  ? "rounded-br-sm bg-brand/12 text-mist ring-1 ring-brand/20"
                  : "rounded-bl-sm bg-ink/70 text-mist ring-1 ring-line"
              }`}
            >
              <Highlighted text={s.text} keywords={keywords} />
            </p>
          </div>
        );
      })}

      {interim && (
        <div className="flex flex-col items-start">
          <p className="mb-1 px-1 text-[11px] font-bold text-fog">인식 중</p>
          <p className="max-w-[85%] rounded-2xl rounded-bl-sm border border-dashed border-line bg-ink/40 px-3.5 py-2.5 text-[13px] leading-relaxed text-fog italic">
            {interim}
          </p>
        </div>
      )}
      <div ref={endRef} />
    </div>
  );
}

/**
 * 비언어 신호 패널.
 *
 * 무슨 말을 했는지가 아니라 어떻게 말하고 있는지를 보여 준다.
 * 수치가 정상 범위면 굳이 경고하지 않고 담담하게 값만 표시한다.
 */
export function NonverbalPanel({ signals }: { signals: NonverbalSignals | null }) {
  if (!signals) {
    return (
      <div>
        <p className="text-[11px] font-bold tracking-[0.18em] text-fog uppercase">말투 신호</p>
        <p className="mt-2 text-[13px] leading-relaxed text-fog">
          마이크로 통화를 듣는 동안 말 빠르기와 쉼을 함께 측정합니다. 데모 모드에서는 실제 소리가 없어
          측정되지 않습니다.
        </p>
      </div>
    );
  }

  const pressure = hasPressurePattern(signals);
  const rows = [
    {
      label: "쉼 없이 이어짐",
      value: `${(signals.speechRatio * 100).toFixed(0)}%`,
      hot: signals.speechRatio >= 0.75,
      hint: "말이 이어진 시간 비율",
    },
    {
      label: "최장 연속 발화",
      value: `${signals.longestRunSec.toFixed(0)}초`,
      hot: signals.longestRunSec >= 25,
      hint: "끼어들 틈을 주는지",
    },
    {
      label: "말 빠르기",
      value: `${Math.round(signals.syllablesPerMin)}음절/분`,
      hot: signals.syllablesPerMin >= 380,
      hint: "보통 대화는 300 안팎",
    },
    {
      label: "음량 변화",
      value: `${signals.loudnessTrend.toFixed(1)}배`,
      hot: signals.loudnessTrend >= 1.35,
      hint: "초반 대비 최근",
    },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-[11px] font-bold tracking-[0.18em] text-fog uppercase">말투 신호</p>
        <span
          className={`rounded-md px-2 py-0.5 text-[10px] font-bold ring-1 ${
            pressure ? "bg-warn/12 text-warn ring-warn/30" : "bg-safe/10 text-safe ring-safe/25"
          }`}
        >
          {pressure ? "압박 패턴" : "특이사항 없음"}
        </span>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-2">
        {rows.map((r) => (
          <div key={r.label} className="rounded-xl bg-ink/60 px-3 py-2.5 ring-1 ring-line">
            <dt className="text-[11px] font-semibold text-fog">{r.label}</dt>
            <dd
              className={`mt-0.5 font-mono text-base font-bold tabular-nums ${
                r.hot ? "text-warn" : "text-mist"
              }`}
            >
              {r.value}
            </dd>
            <p className="mt-0.5 text-[10px] leading-snug text-fog">{r.hint}</p>
          </div>
        ))}
      </dl>

      <p className="mt-3 text-[11px] leading-relaxed text-fog">
        {pressure
          ? "생각할 틈을 주지 않는 말투가 감지됩니다. 다만 이것만으로 사기라고 볼 수는 없어, 발화 내용과 함께 판단합니다."
          : "말투에서는 특별한 압박 패턴이 보이지 않습니다. 위험도 판단은 발화 내용을 기준으로 합니다."}
      </p>
    </div>
  );
}


/** 음성 안내 켜기/끄기 토글 */
export function VoiceToggle({
  on,
  onChange,
  disabled,
  hint,
}: {
  on: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      title={hint}
      onClick={() => onChange(!on)}
      className={`inline-flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[11px] font-bold ring-1 transition disabled:cursor-not-allowed disabled:opacity-45 ${
        on ? "bg-brand/12 text-brand ring-brand/30" : "bg-ink/50 text-fog ring-line hover:text-white"
      }`}
    >
      <span aria-hidden>{on ? "🔊" : "🔈"}</span>
      음성 안내 {on ? "켜짐" : "꺼짐"}
    </button>
  );
}


/** 위험도가 개입 기준을 넘었을 때 화면 상단에 고정되는 배너 */
export function InterventionBanner({
  level,
  message,
  onVerify,
  onDismiss,
}: {
  level: RiskLevel;
  message: string;
  onVerify: () => void;
  onDismiss: () => void;
}) {
  const high = level === "높음";
  return (
    <div
      role="alert"
      className={`pb-fade sticky top-16 z-30 mb-4 rounded-2xl border p-4 backdrop-blur-md @md:p-5 ${
        high ? "border-danger/50 bg-danger/12" : "border-warn/45 bg-warn/10"
      }`}
    >
      <div className="flex flex-col gap-3 @md:flex-row @md:items-center @md:justify-between">
        <div className="flex items-start gap-3">
          <span
            className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-black ${
              high ? "bg-danger/20 text-danger pb-pulse" : "bg-warn/20 text-warn"
            }`}
            aria-hidden
          >
            !
          </span>
          <div>
            <p className={`text-sm font-bold ${high ? "text-danger" : "text-warn"}`}>
              {high ? "지금 멈추세요 — 위험도 높음" : "확인이 필요합니다 — 위험도 중간"}
            </p>
            <p className="mt-1 text-[13px] leading-relaxed text-mist">{message}</p>
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={onVerify}
            className={`rounded-xl px-4 py-2.5 text-sm font-bold text-white transition hover:brightness-110 ${
              high ? "bg-danger" : "bg-warn/90"
            }`}
          >
            지금 확인해볼게요
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-xl border border-line px-3 py-2.5 text-xs font-semibold text-fog transition hover:text-white"
          >
            계속 듣기
          </button>
        </div>
      </div>
    </div>
  );
}

export function LivePrivacyNotice({ className = "" }: { className?: string }) {
  return (
    <details className={`rounded-xl border border-line/70 bg-ink-2/50 px-4 py-3 ${className}`}>
      <summary className="cursor-pointer list-none text-xs font-semibold text-fog transition hover:text-brand">
        음성 처리 안내 · 원문은 기본으로 삭제됩니다
      </summary>
      <p className="mt-2 text-xs leading-relaxed text-fog">
        실시간 인식은 Chrome 내장 Web Speech API를 사용하며, 이 방식은 마이크 음성이 브라우저 제조사의 음성
        인식 서버로 전송됩니다. 변환된 텍스트는 위험도 분석 목적으로만 전송되고 서버에 저장되지 않습니다.
        통화 상대의 개인정보가 포함될 수 있어
        <span className="font-semibold text-mist"> 종료 시 기본값은 &ldquo;원문 삭제&rdquo;</span>이며, 남길지
        여부는 종료 화면에서 직접 고르실 수 있습니다.
      </p>
    </details>
  );
}
