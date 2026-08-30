"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useCase } from "@/lib/case-store";

const FLOW: { href: string; alt?: string; label: string; step: string }[] = [
  // 감지 단계는 진입로가 둘이다: 텍스트 입력(/check)과 실시간 통화(/live)
  { href: "/check", alt: "/live", label: "감지", step: "01" },
  { href: "/result", label: "분석", step: "02" },
  { href: "/verify", label: "역검증", step: "03" },
  { href: "/support", label: "심리지원", step: "04" },
  { href: "/followup", label: "사후지원", step: "05" },
];

export function Header() {
  const pathname = usePathname();
  const { largeText, setLargeText } = useCase();
  const [llm, setLlm] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/status")
      .then((r) => r.json())
      .then((d) => setLlm(Boolean(d.llmEnabled)))
      .catch(() => setLlm(false));
  }, []);

  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-ink/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-5">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand to-brand-deep text-sm font-black text-white">
            PB
          </span>
          <span className="text-[15px] font-bold tracking-tight text-white">
            피싱브레이크
            <span className="ml-2 hidden text-[11px] font-medium text-fog sm:inline">Pishing Break</span>
          </span>
        </Link>
        <div className="flex items-center gap-2 sm:gap-3">
          <span
            className={`hidden rounded-md px-2 py-1 text-[11px] font-semibold ring-1 sm:inline ${
              llm === null
                ? "bg-line/40 text-fog ring-line"
                : llm
                  ? "bg-brand/12 text-brand ring-brand/25"
                  : "bg-warn/12 text-warn ring-warn/25"
            }`}
            title={llm ? "ANTHROPIC_API_KEY 연동됨" : "API 키 미설정 — 룰 기반으로 동작"}
          >
            {llm === null ? "상태 확인 중" : llm ? "Claude 연동됨" : "룰 기반 데모 모드"}
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={largeText}
            onClick={() => setLargeText(!largeText)}
            title="글씨 크기를 키웁니다. 이 브라우저에 저장됩니다."
            className={`rounded-lg px-2.5 py-1.5 text-xs font-bold transition ${
              largeText
                ? "bg-brand/15 text-brand ring-1 ring-brand/30"
                : "text-fog hover:bg-line/40 hover:text-white"
            }`}
          >
            큰 글씨
          </button>
          <Link
            href="/contacts"
            className={`hidden rounded-lg px-3 py-1.5 text-xs font-semibold transition sm:block ${
              pathname === "/contacts"
                ? "bg-brand/15 text-brand"
                : "text-fog hover:bg-line/40 hover:text-white"
            }`}
          >
            비상연락처
          </Link>
          <Link
            href="/check"
            className={`hidden rounded-lg px-3 py-1.5 text-xs font-semibold transition sm:block ${
              pathname === "/check" ? "bg-brand/15 text-brand" : "text-fog hover:bg-line/40 hover:text-white"
            }`}
          >
            상황 입력
          </Link>
          <Link
            href="/live"
            className="inline-flex items-center gap-1.5 rounded-lg bg-danger/15 px-3 py-1.5 text-xs font-bold text-danger ring-1 ring-danger/30 transition hover:bg-danger/25"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-danger pb-pulse" aria-hidden />
            실시간 감지
          </Link>
        </div>
      </div>
    </header>
  );
}

export function FlowSteps() {
  const pathname = usePathname();
  const current = FLOW.findIndex((f) => f.href === pathname || f.alt === pathname);
  if (current < 0) return null;

  return (
    <nav aria-label="진행 단계" className="mb-8">
      <ol className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {FLOW.map((f, i) => {
          const state = i < current ? "done" : i === current ? "active" : "todo";
          return (
            <li key={f.href} className="flex shrink-0 items-center gap-1.5">
              <div
                className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 transition ${
                  state === "active"
                    ? "bg-brand/15 text-brand ring-brand/35"
                    : state === "done"
                      ? "bg-safe/10 text-safe ring-safe/25"
                      : "bg-ink-2/50 text-fog ring-line"
                }`}
              >
                <span className="font-mono text-[10px] opacity-70">{f.step}</span>
                {f.label}
              </div>
              {i < FLOW.length - 1 && <span className="h-px w-3 bg-line" />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function Footer() {
  return (
    <footer className="mt-16 border-t border-line/70 py-8">
      <div className="mx-auto max-w-5xl px-5 text-xs leading-relaxed text-fog">
        <p className="font-semibold text-mist">피싱브레이크 (Pishing Break) — 2026 금융 AI Challenge 예선 제출용 MVP</p>
        <p className="mt-2">
          본 서비스는 시뮬레이션 데모입니다. 실제 피해가 발생했거나 발생이 의심되면 즉시{" "}
          <span className="font-semibold text-white">112(경찰)</span> 또는{" "}
          <span className="font-semibold text-white">1332(금융감독원)</span>로 신고하세요.
        </p>
        <p className="mt-2">
          화면에 표시되는 신고 이력·계좌·전화번호는 모두 가상의 샘플 데이터이며, 실제 인물이나 기관과 무관합니다.
        </p>
      </div>
    </footer>
  );
}
