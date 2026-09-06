import Link from "next/link";
import { MvpNotice, PrimaryButton } from "@/components/ui";

/**
 * 랜딩.
 *
 * 이 화면을 보는 사람은 둘 중 하나다 — 지금 의심스러운 전화를 받고 있거나, 미리 준비하러 왔거나.
 * 어느 쪽이든 필요한 것은 설명이 아니라 버튼이다. 서비스 소개·문제 정의·작동 방식은
 * README와 발표 자료가 할 일이므로 화면에서는 걷어냈다.
 */
export default function Home() {
  return (
    <div className="mx-auto max-w-5xl px-4 pt-6 pb-5 @md:px-5 @md:pt-24 @md:pb-8">
      <div className="pb-fade">
        <span className="inline-flex items-center gap-2 rounded-full border border-brand/30 bg-brand/10 px-3.5 py-1.5 text-xs font-semibold text-brand">
          <span className="h-1.5 w-1.5 rounded-full bg-brand pb-pulse" />
          2026 금융 AI Challenge · MVP 데모
        </span>

        <h1 className="mt-5 text-[2rem] leading-[1.15] font-black tracking-tight text-white @md:text-6xl">
          혼자 판단하지 않게 하는
          <br />
          <span className="bg-gradient-to-r from-brand to-safe bg-clip-text text-transparent">
            AI 금융 중재자
          </span>
        </h1>

        <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-mist @md:text-lg">
          의심되는 통화를 실시간으로 들으며 위험을 감지하고,
          <strong className="font-semibold text-white"> 당신의 판단을 잠시 멈춥니다.</strong>
        </p>

        <div className="mt-6 flex flex-col flex-wrap gap-2.5 @md:flex-row">
          <PrimaryButton href="/live" tone="danger" className="px-7 py-3.5 text-base">
            통화 중이신가요? 실시간 감지 시작
          </PrimaryButton>
          <PrimaryButton href="/contacts" tone="ghost" className="px-7 py-3.5 text-base">
            비상연락처 등록
          </PrimaryButton>
        </div>

        <p className="mt-5 text-xs leading-relaxed text-fog">
          이미 피해가 발생했다면 지금 바로{" "}
          <Link href="tel:112" className="font-bold text-white underline underline-offset-4">
            112
          </Link>{" "}
          또는{" "}
          <Link href="tel:1332" className="font-bold text-white underline underline-offset-4">
            1332
          </Link>
          로 신고하세요.
        </p>

        <MvpNotice className="mt-5" />
      </div>
    </div>
  );
}
