"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useCase } from "@/lib/case-store";

const FLOW: {
  href: string;
  alt?: string;
  label: string;
  step: string;
}[] = [
  { href: "/live", label: "감지", step: "01" },
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
    <header className="sticky top-0 z-40 border-b border-[#dce5ef] bg-white/95 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 @md:h-16 @md:px-5">
        {/* 로고 텍스트만 */}
        <Link href="/" className="flex min-w-0 items-center">
          <span className="text-[15px] font-extrabold tracking-tight whitespace-nowrap text-[#173b72]">
            피싱브레이크
            <span className="ml-2 hidden text-[11px] font-medium text-[#8a9aab] @md:inline">
              Pishing Break
            </span>
          </span>
        </Link>

        {/* 우측 메뉴 */}
        <div className="flex items-center gap-1.5 @md:gap-2.5">
          {/* AI 연결 상태 */}
          <span
            className={`hidden rounded-lg px-2.5 py-1.5 text-[11px] font-semibold ring-1 @md:inline ${
              llm === null
                ? "bg-[#f3f6f9] text-[#8392a5] ring-[#dde5ed]"
                : llm
                  ? "bg-[#eaf4ff] text-[#0868bd] ring-[#bcdcf4]"
                  : "bg-[#fff7e8] text-[#b87913] ring-[#f0d59e]"
            }`}
            title={
              llm
                ? "ANTHROPIC_API_KEY 연동됨"
                : "API 키 미설정 — 룰 기반으로 동작"
            }
          >
            {llm === null
              ? "상태 확인 중"
              : llm
                ? "Claude 연동됨"
                : "룰 기반 데모"}
          </span>

          {/* 큰 글씨 */}
          <button
            type="button"
            role="switch"
            aria-checked={largeText}
            onClick={() => setLargeText(!largeText)}
            title="글씨 크기를 키웁니다. 이 브라우저에 저장됩니다."
            className={`rounded-lg px-2.5 py-1.5 text-xs font-bold transition ${
              largeText
                ? "bg-[#eaf4ff] text-[#0868bd] ring-1 ring-[#bcdcf4]"
                : "text-[#687b91] hover:bg-[#f2f6fa] hover:text-[#173b72]"
            }`}
          >
            큰 글씨
          </button>

          {/* 비상연락처 */}
          <Link
            href="/contacts"
            className={`hidden rounded-lg px-3 py-1.5 text-xs font-semibold transition @md:block ${
              pathname === "/contacts"
                ? "bg-[#eaf4ff] text-[#0868bd]"
                : "text-[#687b91] hover:bg-[#f2f6fa] hover:text-[#173b72]"
            }`}
          >
            비상연락처
          </Link>

          {/* 실시간 감지 */}
          <Link
            href="/live"
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#0868bd] px-3 py-1.5 text-xs font-bold text-white shadow-sm transition hover:bg-[#07589f]"
          >
            <span
              className="h-1.5 w-1.5 rounded-full bg-[#ff6868] pb-pulse"
              aria-hidden
            />
            실시간 감지
          </Link>
        </div>
      </div>
    </header>
  );
}

export function FlowSteps() {
  const pathname = usePathname();

  const current = FLOW.findIndex(
    (f) => f.href === pathname || f.alt === pathname,
  );

  if (current < 0) {
    return null;
  }

  return (
    <nav aria-label="진행 단계" className="mb-2.5 @md:mb-8">
      <p className="text-[11px] font-semibold text-[#0868bd] @md:hidden">
        <span className="font-mono opacity-70">{FLOW[current].step}</span>{" "}
        {FLOW[current].label}
        <span className="ml-1.5 font-normal text-[#8494a7]">
          · {current + 1}/{FLOW.length}
        </span>
      </p>

      <ol className="hidden items-center gap-1.5 overflow-x-auto pb-1 @md:flex">
        {FLOW.map((f, i) => {
          const state =
            i < current ? "done" : i === current ? "active" : "todo";

          return (
            <li key={f.href} className="flex shrink-0 items-center gap-1.5">
              <div
                className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 transition ${
                  state === "active"
                    ? "bg-[#eaf4ff] text-[#0868bd] ring-[#bcdcf4]"
                    : state === "done"
                      ? "bg-[#eaf8f4] text-[#168466] ring-[#bce5d8]"
                      : "bg-white text-[#8494a7] ring-[#dce5ed]"
                }`}
              >
                <span className="font-mono text-[10px] opacity-70">
                  {f.step}
                </span>
                {f.label}
              </div>

              {i < FLOW.length - 1 && (
                <span className="h-px w-3 bg-[#d5dee8]" />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function Footer() {
  return (
    <footer className="mt-16 border-t border-[#dce5ef] bg-white py-8">
      <div className="mx-auto max-w-5xl px-5 text-xs leading-relaxed text-[#74869b]">
        <p>
          본 서비스는 시뮬레이션 데모입니다. 실제 피해가 발생했거나
          발생이 의심되면 즉시{" "}
          <span className="font-bold text-[#0868bd]">112(경찰)</span> 또는{" "}
          <span className="font-bold text-[#0868bd]">1332(금융감독원)</span>
          로 신고하세요.
        </p>

        <p className="mt-2">
          화면에 표시되는 신고 이력·계좌·전화번호는 모두 가상의 샘플
          데이터이며, 실제 인물이나 기관과 무관합니다.
        </p>
      </div>
    </footer>
  );
}
