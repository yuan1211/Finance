import Link from "next/link";
import type { RiskLevel, ScoreBreakdown, VerifyStatus } from "@/lib/types";

export function Panel({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-line/80 bg-panel/60 backdrop-blur-sm shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset] ${className}`}
    >
      {children}
    </div>
  );
}

export function SectionTitle({
  eyebrow,
  title,
  desc,
}: {
  eyebrow?: string;
  title: string;
  desc?: string;
}) {
  return (
    <div className="mb-6">
      {eyebrow && (
        <p className="mb-2 text-xs font-semibold tracking-[0.2em] text-brand uppercase">{eyebrow}</p>
      )}
      <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">{title}</h1>
      {desc && <p className="mt-2 text-sm leading-relaxed text-fog">{desc}</p>}
    </div>
  );
}

const riskStyles: Record<RiskLevel, { bg: string; text: string; ring: string; label: string }> = {
  높음: { bg: "bg-danger/15", text: "text-danger", ring: "ring-danger/40", label: "위험도 높음" },
  중간: { bg: "bg-warn/15", text: "text-warn", ring: "ring-warn/40", label: "위험도 중간" },
  낮음: { bg: "bg-safe/15", text: "text-safe", ring: "ring-safe/40", label: "위험도 낮음" },
};

export function RiskBadge({ level, score }: { level: RiskLevel; score?: number }) {
  const s = riskStyles[level];
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-bold ring-1 ${s.bg} ${s.text} ${s.ring}`}
    >
      <span className={`h-2 w-2 rounded-full bg-current ${level === "높음" ? "pb-pulse" : ""}`} />
      {s.label}
      {typeof score === "number" && <span className="font-mono text-xs opacity-80">{score}점</span>}
    </span>
  );
}

const statusMeta: Record<VerifyStatus, { dot: string; text: string; label: string }> = {
  pending: { dot: "bg-line", text: "text-fog", label: "대기" },
  running: { dot: "bg-brand animate-pulse", text: "text-brand", label: "확인 중" },
  danger: { dot: "bg-danger", text: "text-danger", label: "위험 확인" },
  warning: { dot: "bg-warn", text: "text-warn", label: "주의 필요" },
  clear: { dot: "bg-safe", text: "text-safe", label: "확인 완료" },
};

export function StatusPill({ status }: { status: VerifyStatus }) {
  const m = statusMeta[status];
  return (
    <span className={`inline-flex items-center gap-2 text-xs font-semibold ${m.text}`}>
      <span className={`h-2 w-2 rounded-full ${m.dot}`} />
      {m.label}
    </span>
  );
}

export function PrimaryButton({
  children,
  onClick,
  href,
  disabled,
  type = "button",
  tone = "brand",
  className = "",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
  type?: "button" | "submit";
  tone?: "brand" | "danger" | "ghost";
  className?: string;
}) {
  const tones = {
    brand:
      "bg-gradient-to-b from-brand to-brand-deep text-white shadow-lg shadow-brand-deep/25 hover:brightness-110",
    danger: "bg-gradient-to-b from-danger to-[#c93b3b] text-white shadow-lg shadow-danger/20 hover:brightness-110",
    ghost: "border border-line bg-ink-2/60 text-mist hover:border-brand/50 hover:text-white",
  };
  const cls = `inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-45 ${tones[tone]} ${className}`;

  if (href && !disabled) {
    return (
      <Link href={href} className={cls}>
        {children}
      </Link>
    );
  }
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={cls}>
      {children}
    </button>
  );
}

/**
 * 위험 점수 기여도 분해.
 *
 * 점수 하나만 던지면 사용자는 믿거나 말거나 둘 중 하나다.
 * 어느 요인이 몇 점을 보탰는지 보여 주면 사용자가 스스로 검산할 수 있고,
 * "이건 내 상황이 아닌데"라고 반박할 여지도 생긴다.
 */
export function ScoreBreakdownCard({
  breakdown,
  finalScore,
  engine,
}: {
  breakdown: ScoreBreakdown;
  finalScore: number;
  engine: "claude" | "fallback";
}) {
  if (breakdown.factors.length === 0) {
    return (
      <div>
        <p className="text-[11px] font-bold tracking-[0.18em] text-fog uppercase">위험 점수 구성</p>
        <p className="mt-2 text-[13px] leading-relaxed text-fog">
          규칙 기반으로 잡히는 위험 요인이 없습니다. 알려진 사기 표현이나 신고 이력이 확인되지 않았다는
          뜻입니다.
        </p>
      </div>
    );
  }

  const max = Math.max(...breakdown.factors.map((f) => f.points));
  const gap = finalScore - breakdown.capped;

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-[11px] font-bold tracking-[0.18em] text-fog uppercase">위험 점수 구성</p>
        <p className="font-mono text-[11px] text-fog">
          규칙 기반 산출 <span className="font-semibold text-mist tabular-nums">{breakdown.capped}점</span>
        </p>
      </div>

      <ul className="mt-3 space-y-2.5">
        {breakdown.factors.map((f, i) => (
          <li key={`${f.label}-${i}`}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[13px] font-semibold text-mist">{f.label}</span>
              <span className="font-mono text-[12px] font-bold text-brand tabular-nums">+{f.points}</span>
            </div>
            {/* 단일 계열 막대 — 범례 없이 항목명이 그대로 라벨이 된다 */}
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-ink/70">
              <div
                className="h-full rounded-full bg-brand/70"
                style={{ width: `${Math.max(4, (f.points / max) * 100)}%` }}
              />
            </div>
            <p className="mt-1 text-[11px] leading-relaxed break-keep text-fog">{f.detail}</p>
          </li>
        ))}
      </ul>

      <div className="mt-3 border-t border-line/60 pt-3 text-[11px] leading-relaxed text-fog">
        {engine === "claude" ? (
          gap === 0 ? (
            <>
              Claude의 최종 판정({finalScore}점)이 규칙 기반 산출과 일치합니다.
            </>
          ) : (
            <>
              Claude는 문맥을 반영해 최종 <span className="font-semibold text-mist">{finalScore}점</span>으로
              판정했습니다. 규칙 기반 산출과는{" "}
              <span className="font-mono font-semibold text-mist">
                {gap > 0 ? "+" : ""}
                {gap}점
              </span>{" "}
              차이입니다.
            </>
          )
        ) : (
          <>
            현재 룰 기반으로 동작 중이라 위 합계가 그대로 최종 점수입니다.
            {breakdown.subtotal > 100 && ` (합계 ${breakdown.subtotal}점을 100점으로 잘랐습니다)`}
          </>
        )}
      </div>
    </div>
  );
}

export function MvpNotice({ className = "" }: { className?: string }) {
  return (
    <p
      className={`rounded-xl border border-line/70 bg-ink-2/50 px-4 py-3 text-xs leading-relaxed text-fog ${className}`}
    >
      <span className="font-semibold text-mist">MVP 안내</span> · 현재 버전은 통신사 회선 연동 없이
      동작합니다. 실시간 감지는 통화 오디오를 가로채는 것이 아니라, 스피커폰으로 나오는 소리를 기기 마이크로
      받아 인식하는 방식입니다(OS 정책상 앱이 통화 오디오에 직접 접근할 수 없습니다). 신고 이력·기관
      대표번호는 데모용 가상 데이터이며, 입력 내용은 서버에 저장되지 않고 브라우저 세션에서만 유지됩니다.
    </p>
  );
}

export function EngineBadge({ engine }: { engine: "claude" | "fallback" }) {
  return engine === "claude" ? (
    <span className="rounded-md bg-brand/12 px-2 py-1 text-[11px] font-semibold text-brand ring-1 ring-brand/25">
      Claude 분석
    </span>
  ) : (
    <span className="rounded-md bg-warn/12 px-2 py-1 text-[11px] font-semibold text-warn ring-1 ring-warn/25">
      룰 기반 폴백
    </span>
  );
}

export function Spinner() {
  return <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />;
}
