"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useCase } from "@/lib/case-store";
import {
  buildArrivalScript,
  judgeContactReply,
  respondentLabel,
  type ReplyVerdict,
} from "@/lib/contact-reply";
import { BotSay } from "@/components/bot-say";
import { MvpNotice, Panel, PrimaryButton, SectionTitle, Spinner, StatusPill } from "@/components/ui";
import { FlowSteps } from "@/components/shell";
import type {
  ContactReply,
  ContactReplyRecord,
  ScamType,
  VerifyStepResult,
  VerifyStatus,
} from "@/lib/types";

const SKELETON: { id: VerifyStepResult["id"]; title: string; desc: string }[] = [
  {
    id: "reported",
    title: "1차 · 신고 이력 대조",
    desc: "신고 이력과 대조합니다.",
  },
  {
    id: "official",
    title: "2차 · 공식 대표번호 진위확인",
    desc: "공식 대표번호와 비교합니다.",
  },
  {
    id: "notify",
    title: "3차 · 비상연락처 상황 공유",
    desc: "가족에게 알리고 답을 받아옵니다.",
  },
];

export default function VerifyPage() {
  const router = useRouter();
  const { caseState, contacts, hydrated, setVerification, setContactReply } = useCase();
  const { input, analysis, verification, contactReply } = caseState;

  // 답한 사람 이름. 등록된 연락처가 없으면 일반 명칭으로 부른다.
  const respondent = contacts[0]?.name ?? "";
  const replyVerdict = contactReply
    ? judgeContactReply(contactReply.reply, analysis?.scamType ?? "판단 보류", contactReply.respondent)
    : null;

  // progress가 null이면 이번 화면에서 아직 검증을 돌리지 않은 상태.
  // 이전 세션의 결과가 남아 있으면 전부 펼친 상태로 파생시킨다.
  const [progress, setProgress] = useState<number | null>(null);
  const [notifyMessage, setNotifyMessage] = useState<string | null>(null);
  // 회신을 지켜보는 데 필요한 값. 메일이 실제로 나갔으면 token이 들어온다.
  const [replyMeta, setReplyMeta] = useState<{
    token: string | null;
    mailLive: boolean;
  } | null>(null);
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
      const data: {
        steps: VerifyStepResult[];
        notifyMessage: string;
        replyToken: string | null;
        mailLive: boolean;
      } = await res.json();
      // 결과가 스토어에 반영되기 전에 진행도를 0으로 고정해야
      // 단계 공개 애니메이션이 건너뛰어지지 않는다.
      setProgress(0);
      setVerification(data.steps);
      setNotifyMessage(data.notifyMessage);
      setReplyMeta({ token: data.replyToken, mailLive: data.mailLive });

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
    setReplyMeta(null);
    setContactReply(null);
    setProgress(0);
    void run();
  };

  /** 회신이 도착했을 때(또는 끝내 오지 않았을 때) 한 번만 기록한다 */
  const handleArrive = useCallback(
    (reply: ContactReply, source: "real" | "simulated") => {
      setContactReply({ reply, respondent, at: new Date().toISOString(), source });
    },
    [respondent, setContactReply],
  );

  if (!hydrated || !input) {
    return <div className="mx-auto max-w-3xl px-4 py-12 text-sm @md:px-5 @md:py-16 text-fog">불러오는 중…</div>;
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-5 @md:px-5 @md:py-10">
      <FlowSteps />
      <SectionTitle
        eyebrow="STEP 03 · 역검증"
        title="제가 대신 확인하고 있습니다"
        desc="확인이 끝날 때까지 송금하지 마세요."
      />

      <ol className="space-y-4">
        {SKELETON.map((sk, i) => {
          const result = verification.find((s) => s.id === sk.id);
          const revealed = i < visible && Boolean(result);
          const active = i === visible && running;
          // 수신자 응답이 들어오면 3차 단계의 결론이 바뀐다 (가족 사칭이면 사기 확정)
          const status: VerifyStatus = revealed && result
            ? sk.id === "notify" && replyVerdict
              ? replyVerdict.status
              : result.status
            : active
              ? "running"
              : "pending";

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
                    {/* 근거는 접어 둔다. 통화 중에 읽을 것은 결론 한 줄이면 된다. */}
                    {result.details.length > 0 && (
                      <details className="group">
                        <summary className="cursor-pointer list-none text-[12px] font-semibold text-fog transition hover:text-brand">
                          근거 보기
                        </summary>
                        <ul className="mt-2 space-y-1.5">
                          {result.details.map((d, di) => (
                            <li key={di} className="flex gap-2 text-[13px] leading-relaxed text-mist">
                              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-fog" />
                              {d}
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}

                    {sk.id === "notify" && notifyMessage && (
                      <details className="mt-3">
                        <summary className="cursor-pointer list-none text-[12px] font-semibold text-fog transition hover:text-brand">
                          보낸 내용 보기
                        </summary>
                        <pre className="mt-2 rounded-xl border border-line bg-ink/70 p-3.5 font-sans text-[13px] leading-relaxed whitespace-pre-wrap text-mist">
                          {notifyMessage}
                        </pre>
                      </details>
                    )}

                    {sk.id === "notify" && replyMeta && (
                      <ReplyWatch
                        token={replyMeta.token}
                        mailLive={replyMeta.mailLive}
                        respondent={respondent}
                        scamType={analysis?.scamType ?? "판단 보류"}
                        recorded={contactReply ?? null}
                        verdict={replyVerdict}
                        onArrive={handleArrive}
                      />
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
          비상연락처가 없습니다.{" "}
          <a href="/contacts" className="font-bold underline underline-offset-4">
            등록하기
          </a>
        </p>
      )}

      <div className="mt-7 flex flex-col gap-3 @md:flex-row">
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

/* ------------------------------------------------------------------ */

/** 회신을 확인하러 가는 주기 */
const POLL_MS = 2000;
/** 이만큼 기다려도 답이 없으면 '회신 없음'으로 결론짓는다 */
const WAIT_TIMEOUT_MS = 180_000;
/** 메일이 실제로 나가지 않는 데모 환경에서, 회신이 도착하기까지의 연출 시간 */
const SIM_DELAY_MS = 6500;

/**
 * 비상연락처 회신을 지켜보다가 도착하면 캐릭터가 알려 주는 블록.
 *
 * 왜 사용자에게 묻지 않는가:
 * 이 화면을 보는 사람은 통화 중이고 겁을 먹은 상태다. "가족이 뭐라고 했나요?"를 물어
 * 직접 고르게 하면, 정작 도와야 할 순간에 조작을 시키는 셈이 된다.
 * 그래서 발송한 메일의 회신 버튼으로 답을 직접 받아 와 화면에 띄운다.
 *
 * 다만 지어내지는 않는다. 메일이 실제로 나가지 않은 데모 환경에서는 응답에
 * '시뮬레이션' 표시를 붙인다. 오지 않은 답을 왔다고 하는 것이 가장 위험하다.
 */
function ReplyWatch({
  token,
  mailLive,
  respondent,
  scamType,
  recorded,
  verdict,
  onArrive,
}: {
  token: string | null;
  mailLive: boolean;
  respondent: string;
  scamType: ScamType;
  recorded: ContactReplyRecord | null;
  verdict: ReplyVerdict | null;
  onArrive: (reply: ContactReply, source: "real" | "simulated") => void;
}) {
  const [waitedMs, setWaitedMs] = useState(0);

  /* 실제 회신 폴링 — 메일이 나간 경우에만 돈다 */
  useEffect(() => {
    if (recorded || !token) return;
    const startedAt = Date.now();

    const id = setInterval(() => {
      const waited = Date.now() - startedAt;
      setWaitedMs(waited);

      if (waited > WAIT_TIMEOUT_MS) {
        onArrive("unreachable", "real");
        return;
      }

      void fetch(`/api/contact-reply?token=${encodeURIComponent(token)}`)
        .then((r) => r.json())
        .then((d: { reply?: ContactReply | null }) => {
          if (d.reply) onArrive(d.reply, "real");
        })
        .catch(() => {
          // 일시적인 실패는 다음 주기에 다시 시도한다
        });
    }, POLL_MS);

    return () => clearInterval(id);
  }, [recorded, token, onArrive]);

  /* 데모 경로 — 메일 발송이 꺼져 있으면 회신을 연출한다 (표시는 시뮬레이션으로) */
  useEffect(() => {
    if (recorded || token || mailLive) return;
    const id = setTimeout(() => onArrive("safe", "simulated"), SIM_DELAY_MS);
    return () => clearTimeout(id);
  }, [recorded, token, mailLive, onArrive]);

  const who = respondentLabel(respondent);

  /* ---------------- 기다리는 중 ---------------- */
  if (!recorded || !verdict) {
    return (
      <div className="mt-4 rounded-xl border border-line bg-ink/40 p-4">
        <div className="flex items-center gap-2.5">
          <Spinner />
          <p className="text-[13px] text-mist">
            {who}에게 확인하는 중{token ? ` (${Math.floor(waitedMs / 1000)}초)` : ""}…
          </p>
        </div>
        {!token && (
          <p className="mt-1.5 text-[11px] text-fog/70">메일 발송이 꺼져 있어 도착을 시뮬레이션합니다.</p>
        )}
      </div>
    );
  }

  /* ---------------- 도착 ---------------- */
  return (
    <div className="pb-fade mt-4 rounded-xl border border-line bg-ink/40 p-4">
      {recorded.source === "simulated" && (
        <p className="mb-2 text-right text-[11px] font-semibold text-warn">시뮬레이션</p>
      )}

      {/* 캐릭터가 직접 알려 준다. 표보다 사람 말이 먼저 읽힌다. */}
      <BotSay
        lines={buildArrivalScript(recorded.reply, scamType, recorded.respondent)}
        alert={verdict.status === "danger"}
        size={84}
      />

      {verdict.decisive && (
        <p className="mt-3 flex items-center justify-center gap-1.5 text-[12px] font-bold text-danger">
          <span className="pb-pulse h-1.5 w-1.5 rounded-full bg-danger" aria-hidden />
          사기로 확인되었습니다
        </p>
      )}
    </div>
  );
}
