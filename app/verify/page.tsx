"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useCase } from "@/lib/case-store";
import { MvpNotice, Panel, PrimaryButton, SectionTitle, StatusPill } from "@/components/ui";
import { FlowSteps } from "@/components/shell";
import type { VerifyStepResult, VerifyStatus } from "@/lib/types";

const SKELETON: { id: VerifyStepResult["id"]; title: string; desc: string }[] = [
  {
    id: "reported",
    title: "1차 · 신고 이력 대조",
    desc: "발신번호·계좌번호를 신고 이력 데이터베이스와 대조합니다.",
  },
  {
    id: "official",
    title: "2차 · 공식 대표번호 진위확인",
    desc: "상대가 밝힌 기관의 실제 대표번호와 비교합니다.",
  },
  {
    id: "notify",
    title: "3차 · 비상연락처 상황 공유",
    desc: "가족·지인에게 보낼 객관적 상황 요약문을 AI가 작성합니다.",
  },
];

export default function VerifyPage() {
  const router = useRouter();
  const { caseState, contacts, hydrated, setVerification } = useCase();
  const { input, analysis, verification } = caseState;

  // progress가 null이면 이번 화면에서 아직 검증을 돌리지 않은 상태.
  // 이전 세션의 결과가 남아 있으면 전부 펼친 상태로 파생시킨다.
  const [progress, setProgress] = useState<number | null>(null);
  const [notifyMessage, setNotifyMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef(false);

  const visible = progress ?? (verification.length > 0 ? SKELETON.length : 0);
  const running = !error && visible < SKELETON.length;
  const done = !running;

  useEffect(() => {
    if (hydrated && !input) router.replace("/check");
  }, [hydrated, input, router]);

  const run = useCallback(async () => {
    if (!input) return;
    try {
      const res = await fetch("/api/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input, analysis, contacts }),
      });
      if (!res.ok) throw new Error("검증 요청에 실패했습니다.");
      const data: { steps: VerifyStepResult[]; notifyMessage: string } = await res.json();
      // 결과가 스토어에 반영되기 전에 진행도를 0으로 고정해야
      // 단계 공개 애니메이션이 건너뛰어지지 않는다.
      setProgress(0);
      setVerification(data.steps);
      setNotifyMessage(data.notifyMessage);

      // 단계별로 순차 공개해 '지금 확인 중'이라는 감각을 만든다
      for (let i = 1; i <= data.steps.length; i++) {
        await new Promise((r) => setTimeout(r, 900));
        setProgress(i);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "검증 중 오류가 발생했습니다.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input, analysis, contacts]);

  useEffect(() => {
    if (!hydrated || !input || startedRef.current) return;
    startedRef.current = true;
    // 마운트 시 1회만 실행하는 데이터 요청. 상태 갱신은 모두 await 이후에 일어나므로
    // 렌더 도중의 캐스케이딩 업데이트가 아니다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (verification.length === 0) void run();
  }, [hydrated, input, verification.length, run]);

  const rerun = () => {
    setError(null);
    setNotifyMessage(null);
    setProgress(0);
    void run();
  };

  if (!hydrated || !input) {
    return <div className="mx-auto max-w-3xl px-5 py-16 text-sm text-fog">불러오는 중…</div>;
  }

  return (
    <div className="mx-auto max-w-3xl px-5 py-10">
      <FlowSteps />
      <SectionTitle
        eyebrow="STEP 03 · 역검증"
        title="제가 대신 확인하고 있습니다"
        desc="사용자가 직접 판단하지 않도록, 세 가지 경로로 사실을 교차 확인합니다. 확인이 끝날 때까지 어떤 송금도 하지 마세요."
      />

      <ol className="space-y-4">
        {SKELETON.map((sk, i) => {
          const result = verification.find((s) => s.id === sk.id);
          const revealed = i < visible && Boolean(result);
          const active = i === visible && running;
          const status: VerifyStatus =
            revealed && result ? result.status : active ? "running" : "pending";

          return (
            <li key={sk.id}>
              <Panel
                className={`p-5 transition ${
                  revealed ? "pb-fade" : active ? "border-brand/40" : "opacity-55"
                }`}
              >
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-sm font-bold text-white">{sk.title}</h2>
                  <StatusPill status={status} />
                </div>

                {!revealed && <p className="text-[13px] leading-relaxed text-fog">{sk.desc}</p>}

                {revealed && result && (
                  <>
                    <p
                      className={`mb-3 text-sm leading-relaxed font-semibold ${
                        result.status === "danger"
                          ? "text-danger"
                          : result.status === "warning"
                            ? "text-warn"
                            : "text-safe"
                      }`}
                    >
                      {result.headline}
                    </p>
                    <ul className="space-y-1.5">
                      {result.details.map((d, di) => (
                        <li key={di} className="flex gap-2 text-[13px] leading-relaxed text-mist">
                          <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-fog" />
                          {d}
                        </li>
                      ))}
                    </ul>

                    {sk.id === "notify" && notifyMessage && (
                      <div className="mt-4 rounded-xl border border-line bg-ink/70 p-4">
                        <p className="mb-2 text-[11px] font-bold tracking-widest text-brand uppercase">
                          AI가 작성한 상황 요약문 (발송 시뮬레이션)
                        </p>
                        <pre className="font-sans text-[13px] leading-relaxed whitespace-pre-wrap text-mist">
                          {notifyMessage}
                        </pre>
                      </div>
                    )}
                  </>
                )}
              </Panel>
            </li>
          );
        })}
      </ol>

      {error && (
        <p className="mt-5 rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </p>
      )}

      {contacts.length === 0 && (
        <p className="mt-5 rounded-xl border border-warn/30 bg-warn/[0.06] px-4 py-3 text-[13px] leading-relaxed text-warn">
          아직 비상연락처가 등록되어 있지 않습니다.{" "}
          <a href="/contacts" className="font-bold underline underline-offset-4">
            비상연락처를 등록
          </a>
          하면 위험 상황에서 AI가 가족에게 상황 요약문을 대신 전달합니다.
        </p>
      )}

      <div className="mt-7 flex flex-col gap-3 sm:flex-row">
        <PrimaryButton href="/support" disabled={!done}>
          {done ? "AI 상담 이어가기" : "확인이 끝나면 이어집니다…"}
        </PrimaryButton>
        <PrimaryButton tone="ghost" onClick={rerun} disabled={running}>
          다시 검증하기
        </PrimaryButton>
      </div>

      <MvpNotice className="mt-6" />
    </div>
  );
}
