"use client";

import { use, useCallback, useEffect, useState } from "react";
import { FAMILY_REPLY_OPTIONS } from "@/lib/contact-reply";
import { Panel, Spinner } from "@/components/ui";
import type { ContactReply } from "@/lib/types";

/**
 * 가족·지인이 여는 회신 페이지.
 *
 * 이 화면을 보는 사람은 당황한 상태로 메일을 열었고, 당사자는 지금 통화 중이라 전화를 받지 못한다.
 * 그래서 읽을 것을 최소로 두고 버튼 두 개만 남긴다. 누르는 순간 당사자 화면에 답이 뜬다.
 */

interface PendingView {
  found: boolean;
  respondent?: string;
  message?: string;
  reply?: ContactReply | null;
}

export default function ReplyPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);

  const [view, setView] = useState<PendingView | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<ContactReply | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/contact-reply?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((d: PendingView) => {
        if (!alive) return;
        setView(d);
        if (d.reply) setSent(d.reply);
      })
      .catch(() => alive && setView({ found: false }));
    return () => {
      alive = false;
    };
  }, [token]);

  const send = useCallback(
    async (reply: ContactReply) => {
      setSending(true);
      setError(null);
      try {
        const res = await fetch("/api/contact-reply", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, reply }),
        });
        const d = (await res.json()) as { ok?: boolean; error?: string };
        if (!res.ok || !d.ok) throw new Error(d.error ?? "전달하지 못했습니다.");
        setSent(reply);
      } catch (e) {
        setError(e instanceof Error ? e.message : "전달하지 못했습니다.");
      } finally {
        setSending(false);
      }
    },
    [token],
  );

  if (!view) {
    return (
      <div className="mx-auto flex max-w-lg items-center gap-3 px-5 py-20 text-sm text-fog">
        <Spinner /> 불러오는 중…
      </div>
    );
  }

  if (!view.found) {
    return (
      <div className="mx-auto max-w-lg px-5 py-16">
        <Panel className="p-6">
          <h1 className="text-lg font-bold text-white">요청이 만료되었습니다</h1>
          <p className="mt-2 text-[13px] leading-relaxed text-mist">
            확인 요청이 만료되었거나 이미 처리되었습니다. 가족분에게 직접 전화해 통화를 끊도록
            도와주세요.
          </p>
          <p className="mt-4 text-[13px] leading-relaxed text-fog">
            피해가 발생했다면 즉시 <strong className="text-white">112</strong> 또는{" "}
            <strong className="text-white">1332</strong>로 신고하시기 바랍니다.
          </p>
        </Panel>
      </div>
    );
  }

  const who = view.respondent?.trim();

  return (
    <div className="mx-auto max-w-lg px-5 py-12">
      <p className="mb-2 text-[11px] font-bold tracking-widest text-brand uppercase">
        피싱브레이크 · 확인 요청
      </p>
      <h1 className="text-xl leading-snug font-bold text-white">
        {who ? `${who}님,` : "안녕하세요,"} 가족분이 지금 보이스피싱 의심 통화를 받고 있습니다
      </h1>
      <p className="mt-2.5 text-[13px] leading-relaxed text-mist">
        통화 중이라 전화를 받기 어려울 수 있습니다. 아래 버튼을 눌러 주시면 가족분 화면에 답이 바로
        표시됩니다.
      </p>

      {view.message && (
        <Panel className="mt-5 p-5">
          <p className="mb-2 text-[11px] font-bold tracking-widest text-fog uppercase">상황 요약</p>
          <pre className="font-sans text-[13px] leading-relaxed whitespace-pre-wrap text-mist">
            {view.message}
          </pre>
        </Panel>
      )}

      {sent ? (
        <Panel className="mt-5 border-safe/40 p-6">
          <h2 className="text-base font-bold text-safe">답을 전달했습니다</h2>
          <p className="mt-2 text-[13px] leading-relaxed text-mist">
            {sent === "safe"
              ? "가족분 화면에 '무사하다'는 답이 표시되었습니다. 가능하시면 직접 전화해 통화를 끊도록 도와주세요."
              : "가족분 화면에 '본인이 연락한 것이 맞다'는 답이 표시되었습니다. 그래도 당사자가 직접 목소리를 확인하도록 안내됩니다."}
          </p>
          <p className="mt-4 text-[13px] leading-relaxed text-fog">
            피해가 발생했다면 즉시 <strong className="text-white">112</strong> 또는{" "}
            <strong className="text-white">1332</strong>로 신고하시기 바랍니다.
          </p>
        </Panel>
      ) : (
        <div className="mt-5 flex flex-col gap-2.5">
          {FAMILY_REPLY_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              disabled={sending}
              onClick={() => void send(o.value)}
              className="rounded-2xl border border-line bg-panel px-5 py-4 text-left transition hover:border-brand/50 hover:bg-brand/10 disabled:opacity-50"
            >
              <span className="block text-[15px] font-bold text-white">{o.label}</span>
              <span className="mt-1 block text-[13px] leading-relaxed text-fog">{o.hint}</span>
            </button>
          ))}
        </div>
      )}

      {error && (
        <p className="mt-4 rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-[13px] text-danger">
          {error}
        </p>
      )}

      <p className="mt-6 text-[11px] leading-relaxed text-fog/80">
        이 링크는 당사자가 피싱브레이크에 직접 등록한 비상연락처로 발송되었습니다. 30분 뒤 만료됩니다.
      </p>
    </div>
  );
}
