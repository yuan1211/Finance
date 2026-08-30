"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useCase } from "@/lib/case-store";
import { MvpNotice, Panel, PrimaryButton, RiskBadge, SectionTitle } from "@/components/ui";
import { FlowSteps } from "@/components/shell";
import type { ChatMessage } from "@/lib/types";

const QUICK = [
  "이거 정말 사기인가요?",
  "이미 돈을 보냈어요. 어떻게 하죠?",
  "상대가 계속 전화를 하는데 받아야 하나요?",
  "가족한테 뭐라고 말해야 할까요?",
];

export default function SupportPage() {
  const router = useRouter();
  const { caseState, hydrated, setChat } = useCase();
  const { input, analysis, verification, chat } = caseState;

  // live가 null이면 아직 이 화면에서 대화를 이어가지 않은 상태.
  // 저장된 대화 로그 또는 분석 결과의 안정화 메시지에서 화면을 파생시킨다.
  const [live, setLive] = useState<ChatMessage[] | null>(null);
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (hydrated && !input) router.replace("/check");
  }, [hydrated, input, router]);

  const messages = useMemo<ChatMessage[]>(() => {
    if (live) return live;
    if (chat.length > 0) return chat;
    if (!analysis) return [];
    return [
      {
        role: "assistant",
        content: `${analysis.calmMessage}\n\n지금까지 확인된 내용은 위험도 ${analysis.riskLevel}(${analysis.riskScore}점), 의심 유형은 ${analysis.scamType}입니다. 궁금하거나 불안한 점을 편하게 말씀해 주세요. 제가 같이 확인해 드릴게요.`,
      },
    ];
  }, [live, chat, analysis]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, streaming]);

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || streaming) return;

    const next: ChatMessage[] = [...messages, { role: "user", content: trimmed }];
    setLive(next);
    setDraft("");
    setStreaming(true);

    let acc = "";
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input, analysis, verification, messages: next }),
      });
      if (!res.ok || !res.body) throw new Error("응답을 받지 못했습니다.");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setLive([...next, { role: "assistant", content: acc }]);
      }
    } catch {
      acc =
        "죄송합니다. 응답을 가져오지 못했습니다. 잠시 후 다시 시도해 주세요.\n급하시다면 112(경찰) 또는 1332(금융감독원)로 바로 상담하실 수 있습니다.";
    } finally {
      const final: ChatMessage[] = [...next, { role: "assistant", content: acc }];
      setLive(final);
      setChat(final);
      setStreaming(false);
    }
  };

  if (!hydrated || !input) {
    return <div className="mx-auto max-w-3xl px-5 py-16 text-sm text-fog">불러오는 중…</div>;
  }

  const waiting = streaming && messages[messages.length - 1]?.role === "user";

  return (
    <div className="mx-auto max-w-3xl px-5 py-10">
      <FlowSteps />
      <div className="mb-5 flex flex-wrap items-center gap-3">
        {analysis && <RiskBadge level={analysis.riskLevel} score={analysis.riskScore} />}
        <span className="text-xs text-fog">이 대화는 브라우저 세션에만 남고 서버에 저장되지 않습니다.</span>
      </div>

      <SectionTitle
        eyebrow="STEP 04 · 심리적 지원"
        title="혼자 판단하지 않으셔도 됩니다"
        desc="지금 느끼는 불안, 상대가 했던 말, 이미 하신 행동까지 편하게 말씀해 주세요. 판단은 제가 함께 하겠습니다."
      />

      <Panel className="flex h-[520px] flex-col overflow-hidden">
        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                  m.role === "user"
                    ? "rounded-br-md bg-brand/20 text-white ring-1 ring-brand/30"
                    : "rounded-bl-md bg-ink/70 text-mist ring-1 ring-line"
                }`}
              >
                {m.role === "assistant" && (
                  <p className="mb-1.5 text-[10px] font-bold tracking-widest text-brand uppercase">
                    AI 금융 중재자
                  </p>
                )}
                {m.content}
              </div>
            </div>
          ))}
          {waiting && (
            <div className="flex justify-start">
              <div className="rounded-2xl rounded-bl-md bg-ink/70 px-4 py-3 text-sm text-fog ring-1 ring-line">
                생각하는 중…
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div className="border-t border-line/70 bg-ink/40 p-4">
          <div className="mb-3 flex flex-wrap gap-2">
            {QUICK.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => void send(q)}
                disabled={streaming}
                className="rounded-lg border border-line bg-ink-2/60 px-3 py-1.5 text-xs font-medium text-mist transition hover:border-brand/50 hover:text-white disabled:opacity-40"
              >
                {q}
              </button>
            ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send(draft);
            }}
            className="flex gap-2"
          >
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="지금 상황이나 걱정되는 점을 적어주세요"
              disabled={streaming}
              className="flex-1 rounded-xl border border-line bg-ink/70 px-4 py-3 text-sm text-white placeholder:text-fog/60 outline-none transition focus:border-brand/60 focus:ring-2 focus:ring-brand/20 disabled:opacity-60"
            />
            <PrimaryButton type="submit" disabled={streaming || !draft.trim()} className="px-5">
              보내기
            </PrimaryButton>
          </form>
        </div>
      </Panel>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <PrimaryButton href="/followup">상담 마치고 정리하기</PrimaryButton>
        <PrimaryButton href="/verify" tone="ghost">
          역검증 결과 다시 보기
        </PrimaryButton>
      </div>

      <MvpNotice className="mt-6" />
    </div>
  );
}
