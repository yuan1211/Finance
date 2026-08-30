"use client";

import { useEffect, useState } from "react";
import { useCase } from "@/lib/case-store";
import { MvpNotice, Panel, PrimaryButton, SectionTitle } from "@/components/ui";

export default function ContactsPage() {
  const { contacts, hydrated, addContact, removeContact } = useCase();
  const [name, setName] = useState("");
  const [relation, setRelation] = useState("가족");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [mailEnabled, setMailEnabled] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/status")
      .then((r) => r.json())
      .then((d) => setMailEnabled(Boolean(d.mailEnabled)))
      .catch(() => setMailEnabled(false));
  }, []);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) {
      setError("이름과 연락처를 모두 입력해 주세요.");
      return;
    }
    if (contacts.length >= 2) {
      setError("비상연락처는 최대 2명까지 등록할 수 있습니다.");
      return;
    }
    const trimmedEmail = email.trim();
    if (trimmedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError("이메일 형식을 확인해 주세요.");
      return;
    }
    addContact({
      name: name.trim(),
      relation: relation.trim() || "가족",
      phone: phone.trim(),
      email: trimmedEmail || undefined,
    });
    setName("");
    setPhone("");
    setEmail("");
    setError(null);
  };

  return (
    <div className="mx-auto max-w-3xl px-5 py-10">
      <SectionTitle
        eyebrow="사전 설정"
        title="비상연락처 등록"
        desc="위험이 감지되면 AI가 이곳에 등록된 가족·지인에게 객관적인 상황 요약문을 대신 전달합니다. 혼자 판단하지 않도록 돕는 마지막 안전장치입니다."
      />

      <Panel className="mb-6 p-6">
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[1fr_0.8fr_1.1fr_1.3fr_auto] lg:items-end">
          <div>
            <label htmlFor="name" className="mb-1.5 block text-xs font-semibold text-fog">
              이름
            </label>
            <input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예) 김보호"
              className="w-full rounded-xl border border-line bg-ink/70 px-3.5 py-2.5 text-sm text-white placeholder:text-fog/50 outline-none focus:border-brand/60 focus:ring-2 focus:ring-brand/20"
            />
          </div>
          <div>
            <label htmlFor="relation" className="mb-1.5 block text-xs font-semibold text-fog">
              관계
            </label>
            <select
              id="relation"
              value={relation}
              onChange={(e) => setRelation(e.target.value)}
              className="w-full rounded-xl border border-line bg-ink/70 px-3.5 py-2.5 text-sm text-white outline-none focus:border-brand/60 focus:ring-2 focus:ring-brand/20"
            >
              {["가족", "자녀", "부모", "배우자", "친구", "지인"].map((r) => (
                <option key={r} value={r} className="bg-ink">
                  {r}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="phone" className="mb-1.5 block text-xs font-semibold text-fog">
              연락처
            </label>
            <input
              id="phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="010-0000-0000"
              inputMode="tel"
              className="w-full rounded-xl border border-line bg-ink/70 px-3.5 py-2.5 text-sm text-white placeholder:text-fog/50 outline-none focus:border-brand/60 focus:ring-2 focus:ring-brand/20"
            />
          </div>
          <div>
            <label htmlFor="email" className="mb-1.5 block text-xs font-semibold text-fog">
              이메일 <span className="font-normal opacity-70">(선택)</span>
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="family@example.com"
              inputMode="email"
              className="w-full rounded-xl border border-line bg-ink/70 px-3.5 py-2.5 text-sm text-white placeholder:text-fog/50 outline-none focus:border-brand/60 focus:ring-2 focus:ring-brand/20"
            />
          </div>
          <PrimaryButton type="submit" className="h-[42px] px-5 py-0">
            등록
          </PrimaryButton>
        </form>

        {error && <p className="mt-4 text-sm text-danger">{error}</p>}

        <p className="mt-4 text-[11px] leading-relaxed text-fog">
          등록한 연락처는 이 브라우저에만 저장됩니다. 언제든 삭제할 수 있습니다.{" "}
          {mailEnabled ? (
            <span className="font-semibold text-safe">
              메일 발송이 연동되어 있어, 위험이 감지되면 이메일을 등록한 분께 실제로 상황 요약문이
              발송됩니다.
            </span>
          ) : (
            <span className="text-fog">
              현재 메일 발송 키가 설정되어 있지 않아 3차 검증은 시뮬레이션으로 동작합니다. 이메일을 미리
              적어 두시면 키를 설정하는 즉시 실제 발송으로 바뀝니다.
            </span>
          )}
        </p>
      </Panel>

      <Panel className="p-6">
        <h2 className="mb-4 text-sm font-bold text-white">
          등록된 비상연락처
          <span className="ml-2 font-mono text-xs text-fog">{contacts.length}/2</span>
        </h2>

        {!hydrated ? (
          <p className="text-sm text-fog">불러오는 중…</p>
        ) : contacts.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line bg-ink/40 px-4 py-8 text-center text-sm text-fog">
            아직 등록된 연락처가 없습니다. 위에서 한 명만 등록해도 안전장치가 작동합니다.
          </p>
        ) : (
          <ul className="space-y-3">
            {contacts.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between rounded-xl border border-line/70 bg-ink/50 px-4 py-3.5"
              >
                <div>
                  <p className="text-sm font-bold text-white">
                    {c.name}
                    <span className="ml-2 rounded-md bg-line/60 px-2 py-0.5 text-[11px] font-semibold text-mist">
                      {c.relation}
                    </span>
                  </p>
                  <p className="mt-0.5 font-mono text-xs text-fog">
                    {c.phone}
                    {c.email && <span className="ml-2 text-mist">{c.email}</span>}
                  </p>
                  {!c.email && mailEnabled && (
                    <p className="mt-1 text-[11px] text-warn">
                      이메일이 없어 실제 발송 대상에서 제외됩니다.
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => removeContact(c.id)}
                  className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-fog transition hover:border-danger/50 hover:text-danger"
                >
                  삭제
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <PrimaryButton href="/check">상황 입력하러 가기</PrimaryButton>
        <PrimaryButton href="/" tone="ghost">
          홈으로
        </PrimaryButton>
      </div>

      <MvpNotice className="mt-6" />
    </div>
  );
}
