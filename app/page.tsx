import Link from "next/link";
import { MvpNotice } from "@/components/ui";

export default function Home() {
  return (
    <div className="mx-auto max-w-5xl px-4 pt-6 pb-5 @md:px-5 @md:pt-10 @md:pb-8">
      <div className="pb-fade">
        {/* 메인 카드 */}
        <section className="rounded-[26px] border border-[#e1e8f0] bg-white px-6 py-8 shadow-[0_10px_35px_rgba(25,55,85,0.07)] @md:px-10 @md:py-11">
          <div className="max-w-3xl">
            <p className="mb-3 text-sm font-bold text-[#0872c9]">
              AI 기반 금융사기 예방 서비스
            </p>

            <h1 className="text-[2rem] leading-[1.18] font-black tracking-tight text-[#173b72] @md:text-6xl">
              의심되는 전화,
              <br />
              <span className="text-[#078bd7]">
                혼자 판단하지 마세요
              </span>
            </h1>

            <p className="mt-5 max-w-2xl text-[15px] leading-7 text-[#66758a] @md:text-lg">
              피싱브레이크가 통화 내용을 실시간으로 분석해 금융사기 위험
              신호를 감지하고,
              <strong className="font-semibold text-[#263950]">
                {" "}
                위험한 순간에는 잠시 멈춰 다시 확인할 수 있도록 돕습니다.
              </strong>
            </p>

            {/* 버튼 */}
            <div className="mt-8 flex flex-col gap-3 @md:flex-row">
              <Link
                href="/call-demo"
                className="inline-flex items-center justify-center rounded-xl bg-[#0868bd] px-7 py-4 text-base font-bold text-white shadow-sm transition hover:bg-[#07589f]"
              >
                전화 수신 시연 시작
              </Link>

              <Link
                href="/contacts"
                className="inline-flex items-center justify-center rounded-xl border border-[#ccd8e5] bg-white px-7 py-4 text-base font-bold text-[#36516e] transition hover:border-[#adc4d9] hover:bg-[#f6f9fc]"
              >
                비상연락처 등록
              </Link>
            </div>

            {/* 신고 안내 */}
            <div className="mt-8 border-t border-[#e7edf4] pt-5">
              <p className="text-xs leading-relaxed text-[#74859a] @md:text-sm">
                이미 피해가 발생했다면 지금 바로{" "}
                <Link
                  href="tel:112"
                  className="font-bold text-[#0868bd] underline underline-offset-4"
                >
                  112
                </Link>{" "}
                또는{" "}
                <Link
                  href="tel:1332"
                  className="font-bold text-[#0868bd] underline underline-offset-4"
                >
                  1332
                </Link>
                로 신고하세요.
              </p>
            </div>
          </div>
        </section>

        {/* MVP 안내 */}
        <MvpNotice className="mt-5" />
      </div>
    </div>
  );
}
