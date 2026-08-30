"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useCase } from "@/lib/case-store";
import {
  EngineBadge,
  MvpNotice,
  Panel,
  PrimaryButton,
  RiskBadge,
  ScoreBreakdownCard,
  SectionTitle,
} from "@/components/ui";
import { FlowSteps } from "@/components/shell";
import type { RiskLevel } from "@/lib/types";

const tone: Record<RiskLevel, { bar: string; head: string; sub: string }> = {
  높음: {
    bar: "from-danger to-[#ff9068]",
    head: "잠깐 멈추세요. 지금 결정하지 않으셔도 됩니다.",
    sub: "확인된 위험 신호가 뚜렷합니다. 통화를 끊고 저와 함께 사실을 확인해 볼게요.",
  },
  중간: {
    bar: "from-warn to-[#ffd166]",
    head: "확인이 필요한 신호가 보입니다.",
    sub: "아직 단정하기는 이르지만, 돈을 보내기 전에 반드시 검증이 필요합니다.",
  },
  낮음: {
    bar: "from-safe to-[#7ee2b8]",
    head: "지금까지는 뚜렷한 위험 신호가 없습니다.",
    sub: "다만 금전이나 개인정보를 요구하는 말이 나오면 즉시 다시 확인해 주세요.",
  },
};

export default function ResultPage() {
  const router = useRouter();
  const { caseState, hydrated } = useCase();
  const { analysis, input } = caseState;

  useEffect(() => {
    if (hydrated && !analysis) router.replace("/check");
  }, [hydrated, analysis, router]);

  if (!hydrated || !analysis || !input) {
    return <div className="mx-auto max-w-3xl px-5 py-16 text-sm text-fog">불러오는 중…</div>;
  }

  const t = tone[analysis.riskLevel];

  return (
    <div className="mx-auto max-w-3xl px-5 py-10">
      <FlowSteps />

      <div className="pb-fade">
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <RiskBadge level={analysis.riskLevel} score={analysis.riskScore} />
          <span className="rounded-md bg-line/50 px-2 py-1 text-[11px] font-semibold text-mist">
            의심 유형 · {analysis.scamType}
          </span>
          <EngineBadge engine={analysis.engine} />
        </div>

        <SectionTitle eyebrow="STEP 02 · 분석" title={t.head} desc={t.sub} />

        {/* 위험도 게이지 */}
        <Panel className="mb-5 p-6">
          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-sm font-semibold text-mist">종합 위험 점수</span>
            <span className="font-mono text-2xl font-bold text-white">
              {analysis.riskScore}
              <span className="ml-0.5 text-sm text-fog">/100</span>
            </span>
          </div>
          <div className="h-3 w-full overflow-hidden rounded-full bg-ink">
            <div
              className={`h-full rounded-full bg-gradient-to-r ${t.bar} transition-[width] duration-1000`}
              style={{ width: `${Math.max(4, analysis.riskScore)}%` }}
            />
          </div>
          <div className="mt-2 flex justify-between font-mono text-[10px] text-fog">
            <span>0 안전</span>
            <span>30 주의</span>
            <span>60 위험</span>
            <span>100</span>
          </div>
        </Panel>

        {/* AI 첫 메시지 */}
        <Panel className="mb-5 border-brand/25 bg-brand/[0.06] p-5">
          <p className="mb-1.5 text-[11px] font-bold tracking-widest text-brand uppercase">
            AI 금융 중재자
          </p>
          <p className="text-[15px] leading-relaxed text-white">{analysis.calmMessage}</p>
        </Panel>

        {/* 한눈에 보기 — 길게 읽기 어려운 분을 위해 결론만 세 줄로 */}
        <Panel className="mb-5 border-brand/25 bg-brand/[0.06] p-6">
          <h2 className="mb-3 text-sm font-bold text-brand">한눈에 보기</h2>
          <ol className="space-y-2.5">
            {[
              `이 ${input.channel}은 위험도 ${analysis.riskLevel}(${analysis.riskScore}점)으로 판단됩니다.`,
              analysis.immediateAdvice[0] ??
                (analysis.riskLevel === "낮음"
                  ? "지금 특별히 멈춰야 할 행동은 없습니다."
                  : "지금은 어떤 금액도 이체하거나 인출하지 마세요."),
              analysis.riskLevel === "낮음"
                ? "그래도 마음이 놓이지 않으시면 아래에서 함께 확인해 볼 수 있습니다."
                : "혼자 결정하지 마시고, 아래 '확인해볼게요'를 눌러 함께 확인해요.",
            ].map((line, i) => (
              <li key={i} className="flex gap-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand/15 font-mono text-[11px] font-bold text-brand">
                  {i + 1}
                </span>
                <span className="text-[15px] leading-relaxed font-semibold text-white">{line}</span>
              </li>
            ))}
          </ol>
        </Panel>

        {/* 판단 근거 */}
        <Panel className="mb-5 p-6">
          <h2 className="mb-3 text-sm font-bold text-white">이렇게 판단했습니다</h2>
          <p className="text-sm leading-relaxed text-mist">{analysis.reasoning}</p>

          {analysis.detectedSignals.length > 0 && (
            <ul className="mt-5 space-y-2.5">
              {analysis.detectedSignals.map((s, i) => (
                <li
                  key={`${s.keyword}-${i}`}
                  className="rounded-xl border border-line/70 bg-ink/50 px-4 py-3"
                >
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span className="rounded-md bg-danger/12 px-2 py-0.5 font-mono text-xs font-semibold text-danger">
                      “{s.keyword}”
                    </span>
                    <span className="text-[11px] font-semibold text-fog">{s.category}</span>
                  </div>
                  <p className="text-[13px] leading-relaxed text-mist">{s.explanation}</p>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {/* 점수 구성 */}
        {analysis.scoreBreakdown && (
          <Panel className="mb-5 p-6">
            <ScoreBreakdownCard
              breakdown={analysis.scoreBreakdown}
              finalScore={analysis.riskScore}
              engine={analysis.engine}
            />
          </Panel>
        )}

        {/* 지금 하실 일 */}
        {analysis.immediateAdvice.length > 0 && (
          <Panel className="mb-6 border-warn/25 bg-warn/[0.05] p-6">
            <h2 className="mb-3 text-sm font-bold text-warn">지금 바로 지켜주세요</h2>
            <ul className="space-y-2">
              {analysis.immediateAdvice.map((a, i) => (
                <li key={i} className="flex gap-2.5 text-sm leading-relaxed text-mist">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-warn" />
                  {a}
                </li>
              ))}
            </ul>
          </Panel>
        )}

        <div className="flex flex-col gap-3 sm:flex-row">
          <PrimaryButton href="/verify" tone={analysis.riskLevel === "낮음" ? "brand" : "danger"}>
            지금 확인해볼게요 · 역검증 시작
          </PrimaryButton>
          <PrimaryButton href="/support" tone="ghost">
            AI와 먼저 이야기하기
          </PrimaryButton>
          <Link
            href="/check"
            className="self-center text-xs font-semibold text-fog underline underline-offset-4 hover:text-white"
          >
            다시 입력하기
          </Link>
        </div>

        <MvpNotice className="mt-6" />
      </div>
    </div>
  );
}
