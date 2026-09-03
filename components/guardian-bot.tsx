"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { BotCharacter } from "./bot-character";
import type { GuardianAction, GuardianStep } from "@/lib/guardian";
import type { RiskLevel } from "@/lib/types";

/**
 * 도우미봇 — 위험이 확인된 순간 화면을 덮고 판단을 멈춰 세우는 개입 화면.
 *
 * 왜 배너가 아니라 캐릭터인가:
 * 개입이 필요한 순간 사용자는 이미 상대에게 몰려 있고, 대개 겁을 먹은 상태다. 그 상태에서
 * 경고문 한 덩어리는 읽히지도, 진정시키지도 못한다. 사람이 곁에서 말을 걸어 주는 형태여야
 * "혼자가 아니다"라는 신호가 전달된다. 그래서 문장을 한 번에 띄우지 않고 캐릭터가 한 줄씩
 * 말하듯 흘려보낸다. 느리게 말하는 것 자체가 "급하게 결정하지 않아도 된다"는 메시지다.
 *
 * 한계는 분명히 해 둔다: 이것이 막는 것은 이 서비스 안의 화면 이동이다.
 * 웹 앱은 다른 앱(은행 앱·전화 앱)을 잠그지 못한다. 그 고지는 화면 하단에 그대로 적는다.
 */

export interface GuardianBotProps {
  open: boolean;
  level: RiskLevel;
  score: number;
  /** 분석이 만든 한 문장 (LLM 또는 룰) */
  liveMessage: string;
  calmLines: string[];
  steps: GuardianStep[];
  /** 소리 내어 읽기. 마이크 되먹임 방지는 부모가 관리한다 */
  onSpeak?: (text: string) => void;
  onVerify: () => void;
  onDismiss: () => void;
}

/** 한 글자당 타이핑 간격. 너무 빠르면 "말하는 느낌"이 사라진다 */
const TYPE_MS = 45;
/** 한 줄을 다 말한 뒤 다음 줄로 넘어가기까지의 쉼 */
const LINE_PAUSE_MS = 1100;

/**
 * 닫혀 있을 때는 아예 마운트하지 않는다.
 * 그래야 다시 열릴 때 캐릭터의 말이 처음부터 시작되고, 상태를 따로 되돌릴 필요가 없다.
 */
export function GuardianBot({ open, ...rest }: GuardianBotProps) {
  if (!open) return null;
  return <GuardianPanel {...rest} />;
}

function GuardianPanel({
  level,
  score,
  liveMessage,
  calmLines,
  steps,
  onSpeak,
  onVerify,
  onDismiss,
}: Omit<GuardianBotProps, "open">) {
  const [lineIndex, setLineIndex] = useState(0);
  const [charIndex, setCharIndex] = useState(0);
  const [stepIndex, setStepIndex] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);

  const high = level === "높음";
  const calmDone = lineIndex >= calmLines.length;
  const step = steps[stepIndex];

  // 캐릭터가 지금 말하고 있는 문장. 안심 멘트를 다 하면 지침을 이어서 말한다.
  const bubbleText = calmDone ? (step?.title ?? liveMessage) : (calmLines[lineIndex] ?? "");
  const typing = charIndex < bubbleText.length;

  /*
   * 타이핑과 줄 넘김.
   * 상태 변경은 전부 타이머 안에서 일어난다 — 효과 본문에서 곧바로 바꾸면 연쇄 렌더가 된다.
   */
  useEffect(() => {
    if (charIndex < bubbleText.length) {
      const id = setTimeout(() => setCharIndex((c) => c + 1), TYPE_MS);
      return () => clearTimeout(id);
    }
    // 안심 멘트 구간에서만 자동으로 다음 줄로 넘어간다. 지침은 사용자가 직접 넘긴다.
    if (!calmDone) {
      const id = setTimeout(() => {
        setLineIndex((i) => i + 1);
        setCharIndex(0);
      }, LINE_PAUSE_MS);
      return () => clearTimeout(id);
    }
  }, [bubbleText, charIndex, calmDone]);

  /*
   * 화면 잠금.
   * 데스크톱에서는 앱이 기기 프레임(.pb-screen) 안에서 스크롤되므로 body만 잠그면 뚫린다.
   * 두 곳을 한꺼번에 막기 위해 html에 표시를 남기고 CSS에서 처리한다.
   */
  useEffect(() => {
    document.documentElement.dataset.locked = "";
    return () => {
      delete document.documentElement.dataset.locked;
    };
  }, []);

  /* 열리면 패널로 초점을 옮기고, Tab이 패널 밖으로 나가지 않게 가둔다 */
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    panel.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      // Esc로는 닫지 않는다. 실수로 넘겨 버리면 개입이 무의미해진다.
      if (e.key === "Escape") {
        e.preventDefault();
        return;
      }
      if (e.key !== "Tab") return;
      const focusables = panel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, []);

  const runAction = useCallback(
    (action: GuardianAction) => {
      if (action.kind === "speak") onSpeak?.(action.value);
    },
    [onSpeak],
  );

  /** 기다리기 답답한 사용자를 위해, 누르면 지금 문장을 끝까지 보여 준다 */
  const skipTyping = () => setCharIndex(bubbleText.length);

  const goStep = (next: number) => {
    setStepIndex(next);
    setCharIndex(0);
  };

  const lastStep = stepIndex >= steps.length - 1;

  return (
    <div className="pb-guard" role="alertdialog" aria-modal="true" aria-labelledby="pb-guard-title">
      <div ref={panelRef} tabIndex={-1} className="pb-guard-panel">
        {/* ---------- 위험도 ---------- */}
        <div className="flex justify-end">
          <span
            className={`rounded-lg px-2 py-1 text-[11px] font-bold ring-1 ${
              high ? "bg-danger/15 text-danger ring-danger/30" : "bg-warn/15 text-warn ring-warn/30"
            }`}
          >
            위험 {score}
          </span>
        </div>

        {/* ---------- 캐릭터 ---------- */}
        <div className="mt-1 flex justify-center">
          <BotCharacter alert={high} talking={typing} />
        </div>

        <h2 id="pb-guard-title" className="sr-only">
          {high ? "위험도 높음 — 통화를 멈추세요" : "확인이 필요합니다"}
        </h2>

        {/* ---------- 말풍선 ---------- */}
        <button
          type="button"
          onClick={skipTyping}
          className="pb-bubble"
          aria-live="polite"
          title={typing ? "눌러서 끝까지 보기" : undefined}
        >
          <span className="pb-bubble-text">
            {bubbleText.slice(0, charIndex)}
            {typing && <span className="pb-caret" aria-hidden />}
          </span>
        </button>

        <div className="mt-1.5 flex justify-center">
          <button
            type="button"
            onClick={() => onSpeak?.(bubbleText)}
            className="rounded-lg px-2.5 py-1 text-[11px] font-semibold text-fog transition hover:text-brand"
          >
            소리로 듣기
          </button>
        </div>

        {/* ---------- 지침 상세 ---------- */}
        {calmDone && step && (
          <div className="pb-fade mt-3">
            <div className="mb-2.5 flex justify-center gap-1" aria-hidden>
              {steps.map((s, i) => (
                <span
                  key={s.id}
                  className={`h-1 w-6 rounded-full transition ${i <= stepIndex ? "bg-brand" : "bg-line"}`}
                />
              ))}
            </div>

            {/* 상대에게 그대로 읽을 말이 있으면 그것이 이 단계의 전부다 */}
            {step.say && (
              <p className="rounded-2xl border border-brand/30 bg-brand/10 px-4 py-3.5 text-center text-[15px] leading-relaxed font-semibold text-white">
                “{step.say}”
              </p>
            )}

            {step.actions.length > 0 && (
              <div className="mt-2.5 flex flex-wrap justify-center gap-2">
                {step.actions.map((a) => (
                  <ActionButton key={`${a.kind}-${a.value}`} action={a} onRun={runAction} />
                ))}
              </div>
            )}

            <div className="mt-3 flex gap-2">
              {stepIndex > 0 && (
                <button
                  type="button"
                  onClick={() => goStep(stepIndex - 1)}
                  className="rounded-xl border border-line px-3.5 py-2.5 text-[13px] font-semibold text-fog transition hover:text-white"
                >
                  이전
                </button>
              )}
              {!lastStep && (
                <button
                  type="button"
                  onClick={() => goStep(stepIndex + 1)}
                  className="flex-1 rounded-xl bg-white/95 px-4 py-2.5 text-[13px] font-bold text-ink transition hover:bg-white"
                >
                  다음
                </button>
              )}
            </div>
          </div>
        )}

        {/* ---------- 마무리 ---------- */}
        <div className="mt-4 flex flex-col gap-2 border-t border-line/70 pt-4">
          <button
            type="button"
            onClick={onVerify}
            className={`w-full rounded-xl px-4 py-3 text-sm font-bold text-white transition hover:brightness-110 ${
              high ? "bg-danger" : "bg-warn/90"
            }`}
          >
            진짜인지 확인하기
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="w-full rounded-xl border border-line px-4 py-2.5 text-[13px] font-semibold text-fog transition hover:text-white"
          >
            괜찮아요, 계속 듣기
          </button>
        </div>

        {/* 앱이 은행 앱을 잠글 수는 없다. 그 사실을 한 줄로만 남긴다. */}
        <p className="mt-2.5 text-center text-[11px] text-fog/70">송금은 직접 멈추셔야 합니다.</p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function ActionButton({
  action,
  onRun,
}: {
  action: GuardianAction;
  onRun: (a: GuardianAction) => void;
}) {
  const cls =
    "rounded-xl border border-brand/40 bg-brand/12 px-3.5 py-2 text-[13px] font-semibold text-brand transition hover:bg-brand/20";

  if (action.kind === "tel") {
    return (
      <a href={`tel:${action.value.replace(/[^0-9+]/g, "")}`} className={cls}>
        {action.label}
      </a>
    );
  }

  if (action.kind === "sms") {
    // value는 "번호|본문" 형태다. 사용자 기기의 문자 앱을 본문까지 채워서 연다.
    const [phone, body = ""] = action.value.split("|");
    return (
      <a
        href={`sms:${phone.replace(/[^0-9+]/g, "")}?body=${encodeURIComponent(body)}`}
        className={cls}
      >
        {action.label}
      </a>
    );
  }

  if (action.kind === "link") {
    return (
      <Link href={action.value} className={cls}>
        {action.label}
      </Link>
    );
  }

  return (
    <button type="button" onClick={() => onRun(action)} className={cls}>
      {action.label}
    </button>
  );
}
