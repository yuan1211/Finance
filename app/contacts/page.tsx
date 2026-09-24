"use client";

import { useEffect, useState } from "react";
import { useCase } from "@/lib/case-store";
import { Panel, PrimaryButton, SectionTitle } from "@/components/ui";

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
    <div className="mx-auto max-w-3xl px-4 py-4 @md:px-5 @md:py-10">
      <SectionTitle
        title="비상연락처 등록"
      />

      <Panel className="mb-2.5 p-3 @md:p-6">
        <form onSubmit={submit} className="grid grid-cols-2 gap-2 @5xl:grid-cols-[1fr_0.8fr_1.1fr_1.3fr_auto] @5xl:items-end">
          <div>
            <label htmlFor="name" className="mb-1 block text-[11px] font-semibold text-fog">
              이름
            </label>
            <input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예) 김보호"
              className="w-full rounded-xl border border-line bg-ink/70 px-3 py-2 text-[13px] text-heading placeholder:text-fog outline-none focus:border-brand/60 focus:ring-2 focus:ring-brand/20"
            />
          </div>
          <div>
            <label htmlFor="relation" className="mb-1 block text-[11px] font-semibold text-fog">
              관계
            </label>
            <select
              id="relation"
              value={relation}
              onChange={(e) => setRelation(e.target.value)}
              className="w-full rounded-xl border border-line bg-ink/70 px-3 py-2 text-[13px] text-heading outline-none focus:border-brand/60 focus:ring-2 focus:ring-brand/20"
            >
              {["가족", "자녀", "부모", "배우자", "친구", "지인"].map((r) => (
                <option key={r} value={r} className="bg-ink">
                  {r}
                </option>
              ))}
            </select>
          </div>
          <div className="col-span-2 @5xl:col-span-1">
            <label htmlFor="phone" className="mb-1 block text-[11px] font-semibold text-fog">
              연락처
            </label>
            <input
              id="phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="010-0000-0000"
              inputMode="tel"
              className="w-full rounded-xl border border-line bg-ink/70 px-3 py-2 text-[13px] text-heading placeholder:text-fog outline-none focus:border-brand/60 focus:ring-2 focus:ring-brand/20"
            />
          </div>
          <div className="col-span-2 @5xl:col-span-1">
            <label htmlFor="email" className="mb-1 block text-[11px] font-semibold text-fog">
              이메일 <span className="font-normal opacity-70">(선택)</span>
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="family@example.com"
              inputMode="email"
              className="w-full rounded-xl border border-line bg-ink/70 px-3 py-2 text-[13px] text-heading placeholder:text-fog outline-none focus:border-brand/60 focus:ring-2 focus:ring-brand/20"
            />
          </div>
          <PrimaryButton type="submit" className="col-span-2 h-[40px] px-5 py-0 @5xl:col-span-1">
            등록
          </PrimaryButton>
        </form>

        {error && <p className="mt-4 text-sm text-danger">{error}</p>}

        <p className="mt-2.5 text-[11px] leading-relaxed text-fog">
          이 브라우저에만 저장됩니다.{" "}
          {mailEnabled ? (
            <span className="font-semibold text-safe">메일 발송이 연동되어 있습니다.</span>
          ) : (
            "메일 키가 없어 발송은 시뮬레이션으로 동작합니다."
          )}
        </p>
      </Panel>

      <Panel className="p-3 @md:p-6">
        <h2 className="mb-2 text-sm font-bold text-heading">
          등록된 비상연락처
          <span className="ml-2 font-mono text-xs text-fog">{contacts.length}/2</span>
        </h2>

        {!hydrated ? (
          <p className="text-sm text-fog">불러오는 중…</p>
        ) : contacts.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line bg-ink/40 px-4 py-4 text-center text-[13px] text-fog">
            한 명만 등록해도 작동합니다.
          </p>
        ) : (
          <ul className="space-y-3">
            {contacts.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between rounded-xl border border-line/70 bg-ink/50 px-4 py-3.5"
              >
                <div>
                  <p className="text-sm font-bold text-heading">
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

      <div className="mt-3 flex gap-2.5">
        <PrimaryButton href="/live" className="flex-1">실시간 감지 시작</PrimaryButton>
        <PrimaryButton href="/" tone="ghost">
          홈
        </PrimaryButton>
      </div>

    </div>
  );
}
