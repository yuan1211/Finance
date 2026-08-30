import Link from "next/link";
import { MvpNotice, Panel, PrimaryButton } from "@/components/ui";

const STEPS = [
  {
    step: "01",
    name: "감지 (Detect)",
    desc: "통화 중이라면 스피커폰으로 바꾸는 것만으로 AI가 실시간으로 받아 적으며 위험도를 갱신하고, 통화가 끝난 뒤라면 내용을 텍스트로 입력해 같은 분석을 받을 수 있습니다.",
  },
  {
    step: "02",
    name: "중단 및 역검증 (Verify)",
    desc: "위험이 감지되면 판단을 잠시 멈추고, 신고 이력 대조 → 공식 대표번호 확인 → 비상연락처 공유 순으로 AI가 대신 검증합니다.",
  },
  {
    step: "03",
    name: "심리적 지원 (Support)",
    desc: "가장 위험한 순간은 혼자 결정할 때입니다. AI가 침착한 어조로 대화하며 고립에서 벗어나도록 돕습니다.",
  },
  {
    step: "04",
    name: "사후 지원 (Follow-up)",
    desc: "상담이 끝나면 타임라인과 신고용 사실관계를 자동 정리하고, 112·1332 신고와 지급정지 절차를 안내합니다.",
  },
];

const PROBLEMS = [
  {
    title: "경고는 이미 늦습니다",
    body: "기존 서비스는 '의심됩니다'라고 알려줄 뿐입니다. 정작 판단은 가장 불안한 상태의 피해자 혼자 몫으로 남습니다.",
  },
  {
    title: "가해자는 고립을 설계합니다",
    body: "전화를 끊지 말라, 아무에게도 말하지 말라. 확인할 통로를 끊는 것이 보이스피싱의 핵심 수법입니다.",
  },
  {
    title: "필요한 건 대신 확인해 줄 존재",
    body: "피싱브레이크는 경고 대신 검증을 합니다. 사용자가 판단하지 않아도 되도록 AI가 사실을 확인하고 곁을 지킵니다.",
  },
];

export default function Home() {
  return (
    <div>
      {/* Hero */}
      <section className="mx-auto max-w-5xl px-5 pt-16 pb-12 sm:pt-24">
        <div className="pb-fade">
          <span className="inline-flex items-center gap-2 rounded-full border border-brand/30 bg-brand/10 px-3.5 py-1.5 text-xs font-semibold text-brand">
            <span className="h-1.5 w-1.5 rounded-full bg-brand pb-pulse" />
            2026 금융 AI Challenge · MVP 데모
          </span>

          <h1 className="mt-6 text-4xl leading-[1.15] font-black tracking-tight text-white sm:text-6xl">
            혼자 판단하지 않게 하는
            <br />
            <span className="bg-gradient-to-r from-brand to-safe bg-clip-text text-transparent">
              AI 금융 중재자
            </span>
          </h1>

          <p className="mt-6 max-w-2xl text-base leading-relaxed text-mist sm:text-lg">
            보이스피싱이 의심되는 통화·문자 상황을 입력하면, 피싱브레이크가 위험을 감지하고
            <strong className="font-semibold text-white"> 당신의 판단을 잠시 멈춥니다.</strong> 그리고 AI가
            대신 사실을 확인하고, 확인이 끝날 때까지 곁에서 함께 있습니다.
          </p>

          <div className="mt-9 flex flex-col flex-wrap gap-3 sm:flex-row">
            <PrimaryButton href="/live" tone="danger" className="px-7 py-3.5 text-base">
              통화 중이신가요? 실시간 감지 시작
            </PrimaryButton>
            <PrimaryButton href="/check" className="px-7 py-3.5 text-base">
              텍스트로 상황 입력하기
            </PrimaryButton>
            <PrimaryButton href="/contacts" tone="ghost" className="px-7 py-3.5 text-base">
              비상연락처 등록
            </PrimaryButton>
          </div>
          <p className="mt-4 text-xs text-fog">
            로그인 없이 바로 이용할 수 있습니다. 입력한 내용은 서버에 저장되지 않습니다. 실시간 감지는
            마이크가 없어도 데모 모드로 그대로 체험하실 수 있습니다.
          </p>
        </div>
      </section>

      {/* Problem */}
      <section className="mx-auto max-w-5xl px-5 py-12">
        <h2 className="mb-6 text-xl font-bold text-white sm:text-2xl">
          왜 경고만으로는 막지 못할까요?
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {PROBLEMS.map((p) => (
            <Panel key={p.title} className="p-6">
              <h3 className="mb-2 text-sm font-bold text-white">{p.title}</h3>
              <p className="text-[13px] leading-relaxed text-fog">{p.body}</p>
            </Panel>
          ))}
        </div>
      </section>

      {/* Flow */}
      <section className="mx-auto max-w-5xl px-5 py-12">
        <h2 className="mb-2 text-xl font-bold text-white sm:text-2xl">피싱브레이크가 작동하는 방식</h2>
        <p className="mb-7 text-sm text-fog">감지 → 중단·역검증 → 심리적 지원 → 사후 지원, 네 단계로 이어집니다.</p>

        <div className="grid gap-4 sm:grid-cols-2">
          {STEPS.map((s) => (
            <Panel key={s.step} className="p-6">
              <div className="mb-3 flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand/12 font-mono text-sm font-black text-brand ring-1 ring-brand/25">
                  {s.step}
                </span>
                <h3 className="text-[15px] font-bold text-white">{s.name}</h3>
              </div>
              <p className="text-[13px] leading-relaxed text-mist">{s.desc}</p>
            </Panel>
          ))}
        </div>
      </section>

      {/* Sample */}
      <section className="mx-auto max-w-5xl px-5 py-12">
        <Panel className="overflow-hidden">
          <div className="grid gap-0 md:grid-cols-2">
            <div className="p-7">
              <p className="mb-2 text-[11px] font-bold tracking-widest text-fog uppercase">입력 예시</p>
              <p className="rounded-xl border border-line bg-ink/70 p-4 text-[13px] leading-relaxed text-mist">
                “서울중앙지검 수사관이라며 제 명의로 대포통장이 개설됐다고 했습니다. 무혐의를 입증하려면
                국가안전계좌로 예금을 옮겨야 한다고 하고, 수사 기밀이니 가족에게도 말하지 말고 전화를 끊지
                말라고 했어요.”
              </p>
            </div>
            <div className="border-t border-line/70 bg-danger/[0.05] p-7 md:border-t-0 md:border-l">
              <p className="mb-3 text-[11px] font-bold tracking-widest text-danger uppercase">AI 분석 결과</p>
              <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-danger/15 px-3.5 py-1.5 text-sm font-bold text-danger ring-1 ring-danger/40">
                <span className="h-2 w-2 rounded-full bg-current pb-pulse" />
                위험도 높음 <span className="font-mono text-xs opacity-80">92점</span>
              </p>
              <ul className="space-y-2 text-[13px] leading-relaxed text-mist">
                <li>· “국가안전계좌” — 존재하지 않는 계좌 개념, 전형적 편취 수법</li>
                <li>· “가족에게도 말하지 말고” — 검증을 차단하는 고립 발화</li>
                <li>· “전화를 끊지 말라” — 판단 시간을 빼앗는 통제 발화</li>
                <li>· 발신번호 010-9988-7766 — 신고 이력 47건 확인</li>
              </ul>
            </div>
          </div>
        </Panel>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-5xl px-5 py-12">
        <Panel className="border-brand/25 bg-gradient-to-br from-brand/[0.09] to-transparent p-8 text-center">
          <h2 className="text-xl font-bold text-white sm:text-2xl">지금 의심되는 상황이 있으신가요?</h2>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-mist">
            결정을 서두르지 마세요. 통화를 끊고 여기에 상황을 적어주시면, 무엇이 사실인지 함께 확인해
            드리겠습니다.
          </p>
          <div className="mt-7 flex justify-center">
            <PrimaryButton href="/check" tone="danger" className="px-8 py-3.5 text-base">
              상황 입력하고 확인받기
            </PrimaryButton>
          </div>
          <p className="mt-5 text-xs text-fog">
            실제 피해가 발생했다면 지금 바로{" "}
            <Link href="tel:112" className="font-bold text-white underline underline-offset-4">
              112
            </Link>{" "}
            또는{" "}
            <Link href="tel:1332" className="font-bold text-white underline underline-offset-4">
              1332
            </Link>
            로 신고하세요.
          </p>
        </Panel>
      </section>

      <section className="mx-auto max-w-5xl px-5 pb-8">
        <MvpNotice />
      </section>
    </div>
  );
}
