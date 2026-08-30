"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useCase } from "@/lib/case-store";
import {
  EngineBadge,
  MvpNotice,
  Panel,
  PrimaryButton,
  RiskBadge,
  SectionTitle,
  Spinner,
} from "@/components/ui";
import { FlowSteps } from "@/components/shell";
import type { FollowUpReport, RiskAnalysis } from "@/lib/types";

const HELPLINES = [
  {
    name: "경찰 신고",
    number: "112",
    desc: "보이스피싱 피해 발생 시 즉시 신고",
  },
  { name: "금융감독원", number: "1332", desc: "지급정지·피해구제 상담" },
  { name: "불법스팸 신고", number: "118", desc: "스미싱 문자·악성 링크 신고" },
];

export default function FollowUpPage() {
  const router = useRouter();
  const { caseState, hydrated, setReport, resetCase } = useCase();
  const { input, analysis, report } = caseState;
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  // 리포트도 오류도 아직 없으면 곧 생성 중이라는 뜻 → 별도 loading 상태가 필요 없다
  const loading = !report && !error;

  useEffect(() => {
    if (hydrated && !input) router.replace("/check");
  }, [hydrated, input, router]);

  const generate = useCallback(async () => {
    try {
      const res = await fetch("/api/summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(caseState),
      });
      if (!res.ok) throw new Error("리포트 생성에 실패했습니다.");
      setReport((await res.json()) as FollowUpReport);
    } catch (e) {
      setError(e instanceof Error ? e.message : "리포트 생성 중 오류가 발생했습니다.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseState]);

  useEffect(() => {
    if (!hydrated || !input || started.current) return;
    started.current = true;
    // 마운트 시 1회만 실행하는 데이터 요청. 상태 갱신은 모두 await 이후에 일어나므로
    // 렌더 도중의 캐스케이딩 업데이트가 아니다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!report) void generate();
  }, [hydrated, input, report, generate]);

  const download = () => {
    if (!report) return;
    const lines = [
      "피싱브레이크 상담 요약 리포트",
      `생성 시각: ${new Date().toLocaleString("ko-KR")}`,
      "",
      "[요약]",
      report.summary,
      "",
      "[위험도 판정]",
      analysis
        ? `${analysis.riskLevel} (${analysis.riskScore}점) / 의심 유형: ${analysis.scamType}\n근거: ${analysis.reasoning}`
        : "판정 기록 없음",
      "",
      "[타임라인]",
      ...report.timeline.map((t) => `- ${t.time} ${t.title}: ${t.detail}`),
      "",
      "[신고용 사실관계]",
      ...report.facts.map((f) => `- ${f}`),
      "",
      "[다음 조치]",
      ...report.actions.map((a, i) => `${i + 1}. ${a.title} — ${a.detail}`),
      "",
      "[신고 창구]",
      ...HELPLINES.map((h) => `- ${h.name} ${h.number} (${h.desc})`),
      "",
      "※ 본 리포트는 피싱브레이크 MVP 시뮬레이션 결과이며, 법적 효력이 있는 문서가 아닙니다.",
    ];
    const blob = new Blob([lines.join("\n")], {
      type: "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `피싱브레이크_상담요약_${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!hydrated || !input) {
    return <div className="mx-auto max-w-3xl px-5 py-16 text-sm text-fog">불러오는 중…</div>;
  }

  return (
    <div className="mx-auto max-w-3xl px-5 py-10">
      <div className="print-hide">
        <FlowSteps />
      </div>
      <div className="print-hide mb-5 flex flex-wrap items-center gap-3">
        {analysis && <RiskBadge level={analysis.riskLevel} score={analysis.riskScore} />}
        {report && <EngineBadge engine={report.engine} />}
      </div>

      <div className="print-hide">
        <SectionTitle
          eyebrow="STEP 05 · 사후 지원"
          title="지금까지의 상황을 정리했습니다"
          desc="신고에 필요한 사실관계만 골라 정리했습니다. 아래 내용을 저장해 두시면 경찰서·은행에서 그대로 사용하실 수 있습니다."
        />
      </div>

      {loading && (
        <Panel className="print-hide flex items-center gap-3 p-6 text-sm text-fog">
          <Spinner /> AI가 상담 기록을 정리하고 있습니다…
        </Panel>
      )}

      {error && (
        <Panel className="print-hide border-danger/40 bg-danger/10 p-5">
          <p className="mb-3 text-sm text-danger">{error}</p>
          <PrimaryButton
            tone="ghost"
            onClick={() => {
              setError(null);
              void generate();
            }}
          >
            다시 시도
          </PrimaryButton>
        </Panel>
      )}

      {report && (
        <div className="space-y-5 pb-fade print-hide">
          <Panel className="border-brand/25 bg-brand/[0.06] p-5">
            <p className="mb-1.5 text-[11px] font-bold tracking-widest text-brand uppercase">종합 요약</p>
            <p className="text-[15px] leading-relaxed text-white">{report.summary}</p>
          </Panel>

          <Panel className="p-6">
            <h2 className="mb-4 text-sm font-bold text-white">상황 타임라인</h2>
            <ol className="relative space-y-5 border-l border-line pl-6">
              {report.timeline.map((t, i) => (
                <li key={i} className="relative">
                  <span className="absolute -left-[29px] top-1 h-2.5 w-2.5 rounded-full bg-brand ring-4 ring-brand/15" />
                  <p className="font-mono text-[11px] font-semibold text-brand">{t.time}</p>
                  <p className="text-sm font-bold text-white">{t.title}</p>
                  <p className="mt-0.5 text-[13px] leading-relaxed text-mist">{t.detail}</p>
                </li>
              ))}
            </ol>
          </Panel>

          <Panel className="p-6">
            <h2 className="mb-3 text-sm font-bold text-white">신고 시 필요한 사실관계</h2>
            <ul className="space-y-2">
              {report.facts.map((f, i) => (
                <li key={i} className="flex gap-2.5 text-[13px] leading-relaxed text-mist">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-fog" />
                  {f}
                </li>
              ))}
            </ul>
          </Panel>

          <Panel className="p-6">
            <h2 className="mb-4 text-sm font-bold text-white">지금부터 해야 할 일</h2>
            <ol className="space-y-3">
              {report.actions.map((a, i) => (
                <li key={i} className="rounded-xl border border-line/70 bg-ink/50 p-4">
                  <p className="mb-1 text-sm font-bold text-white">
                    <span className="mr-2 font-mono text-xs text-brand">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    {a.title}
                  </p>
                  <p className="text-[13px] leading-relaxed text-mist">{a.detail}</p>
                </li>
              ))}
            </ol>
          </Panel>

          <Panel className="p-6">
            <h2 className="mb-4 text-sm font-bold text-white">신고·상담 창구 연결</h2>
            <div className="grid gap-3 sm:grid-cols-3">
              {HELPLINES.map((h) => (
                <a
                  key={h.number}
                  href={`tel:${h.number}`}
                  className="rounded-xl border border-line bg-ink/60 p-4 transition hover:border-brand/50"
                >
                  <p className="font-mono text-xl font-black text-white">{h.number}</p>
                  <p className="mt-0.5 text-xs font-bold text-brand">{h.name}</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-fog">{h.desc}</p>
                </a>
              ))}
            </div>
            <div className="mt-4 rounded-xl border border-warn/25 bg-warn/[0.05] p-4">
              <p className="mb-1.5 text-xs font-bold text-warn">지급정지 요청 절차</p>
              <ol className="space-y-1 text-[13px] leading-relaxed text-mist">
                <li>1. 송금한 은행 고객센터 또는 112에 전화해 계좌 지급정지를 신청합니다.</li>
                <li>2. 경찰서를 방문해 사건사고사실확인원을 발급받습니다.</li>
                <li>3. 발급받은 서류로 은행에 피해구제(피해금 환급)를 신청합니다.</li>
                <li>4. 처리 경과는 금융감독원 1332를 통해 확인할 수 있습니다.</li>
              </ol>
            </div>
          </Panel>

          <div className="print-hide flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <PrimaryButton onClick={() => window.print()}>신고서 양식 인쇄 · PDF 저장</PrimaryButton>
            <PrimaryButton tone="ghost" onClick={download}>
              요약 리포트 저장 (.txt)
            </PrimaryButton>
            <PrimaryButton
              tone="ghost"
              onClick={() => {
                resetCase();
                router.push("/check");
              }}
            >
              기록 삭제하고 새로 시작
            </PrimaryButton>
          </div>
          <p className="print-hide text-[11px] leading-relaxed text-fog">
            인쇄 대화상자에서 프린터 대신 <strong className="text-mist">&ldquo;PDF로 저장&rdquo;</strong>을
            고르시면 파일로 남길 수 있습니다. 경찰서·은행 방문 시 그대로 제출하실 수 있는 양식입니다.
          </p>
        </div>
      )}

      <MvpNotice className="print-hide mt-6" />

      {report && (
        <ReportSheet
          report={report}
          analysis={analysis}
          channel={input.channel}
          callerNumber={input.callerNumber}
          accountNumber={input.accountNumber}
          claimedOrg={input.claimedOrg}
        />
      )}
    </div>
  );
}

/**
 * 인쇄 전용 신고서 양식.
 *
 * 화면에서는 숨어 있다가 인쇄할 때만 나타난다(globals.css의 @media print).
 * 경찰서 진술이나 은행 지급정지 신청에서 실제로 묻는 항목 순서를 따랐다.
 */
function ReportSheet({
  report,
  analysis,
  channel,
  callerNumber,
  accountNumber,
  claimedOrg,
}: {
  report: FollowUpReport;
  analysis: RiskAnalysis | null;
  channel: string;
  callerNumber?: string;
  accountNumber?: string;
  claimedOrg?: string;
}) {
  const now = new Date();
  const rows: [string, string][] = [
    ["작성 일시", now.toLocaleString("ko-KR")],
    ["접촉 경로", channel],
    ["발신번호", callerNumber?.trim() || "확인되지 않음"],
    ["상대 주장 소속", claimedOrg?.trim() || "확인되지 않음"],
    ["안내받은 계좌", accountNumber?.trim() || "없음"],
    [
      "AI 위험도 판정",
      analysis
        ? `${analysis.riskLevel} (${analysis.riskScore}점) · 의심 유형 ${analysis.scamType}`
        : "판정 기록 없음",
    ],
  ];

  return (
    <section className="print-only print-sheet" aria-hidden>
      <h1>보이스피싱 피해 신고용 정리서</h1>
      <p style={{ fontSize: "10pt", color: "#444", margin: 0 }}>
        피싱브레이크(Pishing Break) 자동 생성 · 신고 접수 시 참고 자료
      </p>

      <h2>1. 사건 개요</h2>
      <table className="avoid-break">
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k}>
              <th scope="row">{k}</th>
              <td>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>2. 상황 요약</h2>
      <p style={{ margin: 0 }}>{report.summary}</p>

      <h2>3. 시간순 경과</h2>
      <ol style={{ margin: 0, paddingLeft: "6mm" }}>
        {report.timeline.map((t, i) => (
          <li key={i}>
            <strong>{t.time}</strong> {t.title} — {t.detail}
          </li>
        ))}
      </ol>

      <h2>4. 확인된 사실관계</h2>
      <ol style={{ margin: 0, paddingLeft: "6mm" }}>
        {report.facts.map((f, i) => (
          <li key={i}>{f}</li>
        ))}
      </ol>

      {analysis && analysis.detectedSignals.length > 0 && (
        <>
          <h2>5. 감지된 위험 신호</h2>
          <table className="avoid-break">
            <tbody>
              {analysis.detectedSignals.map((sig, i) => (
                <tr key={i}>
                  <th scope="row">{sig.keyword}</th>
                  <td>
                    {sig.category} — {sig.explanation}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <h2>{analysis && analysis.detectedSignals.length > 0 ? "6" : "5"}. 조치 및 신고 창구</h2>
      <ol style={{ margin: 0, paddingLeft: "6mm" }}>
        {report.actions.map((a, i) => (
          <li key={i}>
            <strong>{a.title}</strong> — {a.detail}
          </li>
        ))}
        {HELPLINES.map((h) => (
          <li key={h.number}>
            {h.name} {h.number} — {h.desc}
          </li>
        ))}
      </ol>

      <p className="note">
        본 문서는 피싱브레이크가 사용자의 진술과 AI 분석을 바탕으로 자동 정리한 참고 자료이며, 법적 효력이
        있는 공문서가 아닙니다. 문서에 포함된 신고 이력·기관 대표번호 조회 결과는 데모용 가상 데이터를 대조한
        것입니다. 실제 신고는 112(경찰) 또는 1332(금융감독원)를 통해 접수해 주시기 바랍니다.
      </p>
    </section>
  );
}
