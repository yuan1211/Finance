"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useCase } from "@/lib/case-store";
import { MvpNotice, Panel, PrimaryButton, SectionTitle, Spinner } from "@/components/ui";
import { FlowSteps } from "@/components/shell";
import type { ChannelType, RiskAnalysis } from "@/lib/types";

const SAMPLES = [
  {
    label: "검찰 사칭 통화",
    channel: "통화" as ChannelType,
    callerNumber: "010-9988-7766",
    claimedOrg: "서울중앙지검",
    accountNumber: "1002-987-654321",
    content:
      "서울중앙지검 김민수 수사관이라고 하면서, 제 명의로 대포통장이 개설돼 범죄에 연루됐다고 했습니다. 무혐의를 입증하려면 자산검수를 받아야 한다며 국가안전계좌로 예금을 이체하라고 했어요. 수사 기밀이라 가족이나 은행 직원에게도 말하면 공범이 된다면서 전화를 끊지 말라고 계속 통화를 유지시켰습니다.",
  },
  {
    label: "가족 사칭 문자",
    channel: "문자" as ChannelType,
    callerNumber: "010-5555-4444",
    claimedOrg: "딸",
    accountNumber: "",
    content:
      "엄마 나야 딸. 폰 액정이 깨져서 지금 새 번호로 문자하는 거야. 통화는 안 돼. 급하게 결제할 게 있는데 내 카드가 정지돼서 그래. 이 링크 눌러서 앱 하나만 설치해주고 문화상품권 대신 결제해줄 수 있어? http://kr-parcel-check.top/pay",
  },
  {
    label: "정상 은행 안내 문자",
    channel: "문자" as ChannelType,
    callerNumber: "1588-9999",
    claimedOrg: "국민은행",
    accountNumber: "",
    content:
      "[국민은행] 고객님의 자동이체 결제일이 9월 5일로 변경되었습니다. 문의사항은 KB스타뱅킹 앱 또는 고객센터를 이용해 주세요.",
  },
];

export default function CheckPage() {
  const router = useRouter();
  const { setInput, setAnalysis } = useCase();
  const [channel, setChannel] = useState<ChannelType>("통화");
  const [content, setContent] = useState("");
  const [callerNumber, setCallerNumber] = useState("");
  const [claimedOrg, setClaimedOrg] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [llmReady, setLlmReady] = useState<boolean | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/status")
      .then((r) => r.json())
      .then((d) => setLlmReady(Boolean(d.llmEnabled)))
      .catch(() => setLlmReady(false));
  }, []);

  const applySample = (s: (typeof SAMPLES)[number]) => {
    setChannel(s.channel);
    setContent(s.content);
    setCallerNumber(s.callerNumber);
    setClaimedOrg(s.claimedOrg);
    setAccountNumber(s.accountNumber);
    setError(null);
  };

  /** 캡처 이미지를 읽어 본문 칸을 채운다. 사용자가 내용을 확인한 뒤 분석을 누르게 한다. */
  const readImage = async (file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      setError("이미지 용량은 5MB 이하여야 합니다.");
      return;
    }
    setOcrBusy(true);
    setError(null);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("이미지를 읽지 못했습니다."));
        reader.readAsDataURL(file);
      });
      const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);

      const res = await fetch("/api/analyze-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: base64, mediaType: file.type, callerNumber }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "이미지 분석에 실패했습니다.");

      setChannel("문자");
      setContent(data.extractedText);
      if (data.senderInfo && data.senderInfo !== "확인 불가" && !callerNumber.trim()) {
        setCallerNumber(data.senderInfo);
      }
      // 분석 결과까지 이미 나왔으므로 그대로 이어서 보여 준다
      setInput({
        channel: "문자",
        content: data.extractedText,
        callerNumber: callerNumber || data.senderInfo || "",
        claimedOrg,
        accountNumber,
      });
      setAnalysis(data.analysis as RiskAnalysis);
      router.push("/result");
    } catch (e) {
      setError(e instanceof Error ? e.message : "이미지 분석 중 오류가 발생했습니다.");
      setOcrBusy(false);
    }
  };

  const submit = async () => {
    if (content.trim().length < 5) {
      setError("통화 내용 또는 문자 원문을 5자 이상 입력해 주세요.");
      return;
    }
    setLoading(true);
    setError(null);
    const payload = { channel, content, callerNumber, claimedOrg, accountNumber };
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? "분석에 실패했습니다.");
      }
      const analysis: RiskAnalysis = await res.json();
      setInput(payload);
      setAnalysis(analysis);
      router.push("/result");
    } catch (e) {
      setError(e instanceof Error ? e.message : "분석 중 오류가 발생했습니다.");
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-5 @md:px-5 @md:py-10">
      <FlowSteps />
      <SectionTitle
        eyebrow="STEP 01 · 감지"
        title="지금 무슨 일이 있었는지 알려주세요"
        desc="통화 내용을 기억나는 대로 적거나, 받은 문자를 그대로 붙여넣으시면 됩니다. 문장이 정리되지 않아도 괜찮습니다."
      />

      <Panel className="mb-5 flex flex-col gap-3 border-danger/25 bg-danger/[0.06] p-4 @md:flex-row @md:items-center @md:justify-between">
        <p className="text-[13px] leading-relaxed text-mist">
          <strong className="font-bold text-white">지금 통화 중이신가요?</strong> 스피커폰으로 바꾸면 AI가
          실시간으로 들으면서 위험 신호가 나오는 순간 알려드립니다.
        </p>
        <PrimaryButton href="/live" tone="danger" className="shrink-0 px-4 py-2.5 text-xs">
          실시간 감지로 이동
        </PrimaryButton>
      </Panel>

      <div className="mb-5 flex flex-wrap gap-2">
        <span className="self-center text-xs font-semibold text-fog">빠른 체험용 예시</span>
        {SAMPLES.map((s) => (
          <button
            key={s.label}
            type="button"
            onClick={() => applySample(s)}
            className="rounded-lg border border-line bg-ink-2/60 px-3 py-1.5 text-xs font-semibold text-mist transition hover:border-brand/50 hover:text-white"
          >
            {s.label}
          </button>
        ))}
      </div>

      <Panel className="mb-5 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-white">문자 캡처로 분석하기</h2>
            <p className="mt-1 text-[12px] leading-relaxed text-fog">
              받은 문자나 메신저 화면을 캡처해서 올리면 AI가 내용을 읽어 바로 분석합니다. 옮겨 적을 필요가
              없습니다.
            </p>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void readImage(f);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={ocrBusy || llmReady === false}
            className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-line bg-ink-2/60 px-4 py-2.5 text-xs font-bold text-mist transition hover:border-brand/50 hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
          >
            {ocrBusy ? (
              <>
                <Spinner /> 이미지 읽는 중…
              </>
            ) : (
              "캡처 이미지 올리기"
            )}
          </button>
        </div>
        {llmReady === false && (
          <p className="mt-3 text-[11px] leading-relaxed text-warn">
            이미지 분석은 Claude API 키가 설정되어 있어야 동작합니다. 지금은 아래에 문자 내용을 직접
            붙여넣어 주세요.
          </p>
        )}
      </Panel>

      <Panel className="p-6">
        <fieldset className="mb-6">
          <legend className="mb-2 text-sm font-semibold text-mist">어떤 경로였나요?</legend>
          <div className="flex gap-2">
            {(["통화", "문자"] as ChannelType[]).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setChannel(c)}
                className={`rounded-xl px-4 py-2.5 text-sm font-bold transition ${
                  channel === c
                    ? "bg-brand/15 text-brand ring-1 ring-brand/40"
                    : "bg-ink-2/60 text-fog ring-1 ring-line hover:text-white"
                }`}
              >
                {c === "통화" ? "전화 통화" : "문자 / 메신저"}
              </button>
            ))}
          </div>
        </fieldset>

        <label className="mb-2 block text-sm font-semibold text-mist" htmlFor="content">
          {channel === "통화" ? "통화 내용 요약" : "받은 문자 원문"}
          <span className="ml-1 text-danger">*</span>
        </label>
        <textarea
          id="content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={9}
          placeholder={
            channel === "통화"
              ? "예) 검찰청 수사관이라며 제 명의로 대포통장이 개설됐다고 했습니다. 안전계좌로 돈을 옮기라고 하면서 전화를 끊지 말라고 했어요."
              : "받은 문자를 그대로 붙여넣어 주세요."
          }
          className="w-full resize-y rounded-xl border border-line bg-ink/70 px-4 py-3.5 text-sm leading-relaxed text-white placeholder:text-fog/60 outline-none transition focus:border-brand/60 focus:ring-2 focus:ring-brand/20"
        />
        <p className="mt-2 text-right font-mono text-[11px] text-fog">{content.length}자</p>

        <div className="mt-5 grid gap-4 @md:grid-cols-3">
          <Field
            id="caller"
            label="발신번호"
            value={callerNumber}
            onChange={setCallerNumber}
            placeholder="010-0000-0000"
          />
          <Field
            id="org"
            label="상대가 밝힌 소속"
            value={claimedOrg}
            onChange={setClaimedOrg}
            placeholder="예) 금융감독원"
          />
          <Field
            id="account"
            label="안내받은 계좌"
            value={accountNumber}
            onChange={setAccountNumber}
            placeholder="숫자만 입력"
          />
        </div>

        {error && (
          <p className="mt-5 rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
            {error}
          </p>
        )}

        <div className="mt-6 flex flex-col gap-3 @md:flex-row @md:items-center">
          <PrimaryButton onClick={submit} disabled={loading} className="@md:min-w-52">
            {loading ? (
              <>
                <Spinner /> AI가 확인하는 중…
              </>
            ) : (
              "AI에게 확인 요청하기"
            )}
          </PrimaryButton>
          <p className="text-xs leading-relaxed text-fog">
            분석에는 보통 5~15초가 걸립니다. 그동안 통화는 끊고 기다리셔도 괜찮습니다.
          </p>
        </div>
      </Panel>

      <MvpNotice className="mt-6" />
    </div>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-xs font-semibold text-fog">
        {label} <span className="font-normal opacity-70">(선택)</span>
      </label>
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-line bg-ink/70 px-3.5 py-2.5 text-sm text-white placeholder:text-fog/50 outline-none transition focus:border-brand/60 focus:ring-2 focus:ring-brand/20"
      />
    </div>
  );
}
