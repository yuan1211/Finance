"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { BotCharacter } from "@/components/bot-character";
import styles from "./page.module.css";

type Check = "waiting" | "searching" | "risk" | "clear";
type Call = "ready" | "incoming" | "connected" | "ended";

const SCRIPTS = {
  risk: [
    "서울중앙지검 수사관입니다. 본인 명의의 계좌 확인 때문에 연락드렸습니다.",
    "수사 중이니 가족이나 은행에는 이 통화 내용을 말하지 마세요.",
    "지금 바로 안전계좌로 돈을 이체하세요. 전화를 끊으면 안 됩니다.",
  ],
  kidnap: [
    "당신 가족을 데리고 있습니다. 지금 제 말을 잘 들으세요.",
    "가족에게 전화하거나 다른 사람에게 알리지 마세요.",
    "무사히 돌려받으려면 지금 돈을 보내세요. 전화를 끊지 마세요.",
  ],
};

function Phone({ end = false }: { end?: boolean }) {
  return <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden style={{ transform: end ? "rotate(135deg)" : undefined }}><path d="M7 3 4 4c-2 1 0 7 4 11s10 6 11 4l1-3-5-3-2 2c-2-1-3-2-4-4l2-2-4-6Z" fill="currentColor" /></svg>;
}

export default function CallDemo() {
  const [call, setCall] = useState<Call>("ready");
  const [check, setCheck] = useState<Check>("waiting");
  const [scenario, setScenario] = useState<"risk" | "kidnap">("risk");

  const [verifyStep, setVerifyStep] = useState(0);
  const [resultOpen, setResultOpen] = useState(false);
  const resultRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (resultOpen) {
      resultRef.current?.scrollIntoView({ block: "start" });
      resultRef.current?.focus({ preventScroll: true });
    }
  }, [resultOpen]);
  const [bot, setBot] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [muted, setMuted] = useState(false);
  const [speaker, setSpeaker] = useState(false);
  const [lineCount, setLineCount] = useState(0);
  const [detected, setDetected] = useState(false);
  const botRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (bot) botRef.current?.scrollIntoView({ block: "end" });
  }, [bot]);
  const active = call === "incoming" || call === "connected";
  const family = scenario === "kidnap";
  const verified = verifyStep === 3;
  const reassurance = family ? [
    "많이 놀라셨죠. 제가 가족과 가까운 지인에게 확인하고 있어요. 혼자 판단하려 하지 마시고, 잠시 저와 함께 기다려 주세요.",
    "가족에게 확인 요청을 보냈어요. 아직 상대방의 말이 사실로 확인된 건 아니에요. 숨을 천천히 내쉬면서, 돈을 보내는 일은 잠시 멈춰 주세요.",
    "가까운 지인에게도 확인하고 있어요. 재촉하더라도 ‘확인할 시간이 필요합니다. 잠시 기다려 주세요’라고 답하셔도 돼요. 제가 답을 기다리고 있어요.",
    "시연에서는 가족과 지인의 안전 확인 답이 도착했어요. 많이 놀라셨을 텐데, 잠시 숨을 고르세요. 상대의 요구대로 바로 행동하지 않고 확인하신 거예요.",
  ][verifyStep] : [
    "갑자기 수사 이야기까지 들으니 당황스러우셨죠. 제가 상대가 말한 기관을 확인할게요. 지금 당장 결정을 내리지 않으셔도 돼요.",
    "공식 번호 정보를 확인하고 있어요. 숨을 천천히 내쉬어 보세요. 상대가 재촉해도 송금이나 개인정보 제공은 잠시 멈춰 주세요.",
    "발신번호를 대조하고 있어요. ‘지금 확인하고 있으니 잠시 기다려 주세요’라고 답하셔도 돼요. 제가 확인하는 동안 차분히 기다려 주세요.",
    "시연에서는 발신번호와 대표번호가 다르게 나왔어요. 이것만으로 사칭을 확정할 수는 없지만, 급하게 송금할 필요는 없어요. 이제 확인된 내용을 함께 살펴봐요.",
  ][verifyStep];

  useEffect(() => {
    if (call !== "connected" || !detected) return;
    const timers = [3000, 6500, 11000].map((delay, i) =>
      setTimeout(() => {
        setVerifyStep(i + 1);
        if (i === 2) { setBot(false); setResultOpen(true); }
      }, delay),
    );
    return () => timers.forEach(clearTimeout);
  }, [call, detected]);

  useEffect(() => {
    if (!active || check !== "waiting") return;
    const id = setTimeout(() => setCheck("searching"), 1400);
    return () => clearTimeout(id);
  }, [active, check]);
  useEffect(() => {
    if (!active || check !== "searching") return;
    const id = setTimeout(() => setCheck(scenario === "risk" ? "risk" : "clear"), 3200);
    return () => clearTimeout(id);
  }, [active, check, scenario]);
  useEffect(() => {
    if (call !== "connected") return;
    const id = setInterval(() => setSeconds(n => n + 1), 1000);
    return () => clearInterval(id);
  }, [call]);

  useEffect(() => {
    if (call !== "connected") return;
    // Deterministic demo: show the triggering utterance before the warning.
    const timers = [1800, 4800, 8000].map((delay, i) =>
      setTimeout(() => setLineCount(i + 1), delay),
    );
    timers.push(setTimeout(() => {
      setDetected(true);
      setBot(true);
    }, 9000));
    return () => timers.forEach(clearTimeout);
  }, [call, scenario]);

  function start() {
    setResultOpen(false);
    setCheck("waiting"); setBot(false); setSeconds(0); setMuted(false); setSpeaker(false); setLineCount(0); setDetected(false); setVerifyStep(0); setCall("incoming");
  }
  function end() { setCall("ended"); setBot(false); setResultOpen(false); }

  return <div className={styles.screen}>
    <div className={styles.top}><Link href="/" aria-label="홈으로 돌아가기">‹</Link><span>피싱브레이크 <b>수신 시연</b></span><span className={styles.dot} /></div>
    {call === "ready" ? <section className={styles.intro}>
      <div className={styles.heroIcon}><Phone /></div>
      <p className={styles.eyebrow}>전화가 오는 순간부터</p>
      <h1>통화를 듣고,<br />위험한 순간 알려드려요.</h1>
      <p className={styles.description}>앱을 열지 않아도 모르는 번호를 확인하고<br />전화 화면 위에서 위험을 알려주는 경험.</p>
      <ol className={styles.steps}><li>전화 받기 · 위험 발언 감지</li><li>봇이 기관 또는 가족·지인 확인</li></ol>
      <fieldset className={styles.scenarios}><legend>시연할 상황</legend><label><input type="radio" name="scenario" checked={scenario === "risk"} onChange={() => setScenario("risk")} />기관 사칭 · 송금 요구 통화</label><label><input type="radio" name="scenario" checked={scenario === "kidnap"} onChange={() => setScenario("kidnap")} />납치 사칭 · 가족 안전 확인</label></fieldset>
      <button className={styles.primary} onClick={start}>전화 수신 시연 시작</button>
      <p className={styles.disclaimer}>실제 전화·번호 조회 없이 가상 데이터로 진행됩니다.</p>
    </section> : resultOpen && call === "connected" ? <section ref={resultRef} tabIndex={-1} className={styles.fullResult} aria-label="분석 결과">
      <p className={styles.eyebrow}>분석 결과 · 시연</p>
      <span className={styles.ongoing}>● 통화 유지 중 · {Math.floor(seconds / 60).toString().padStart(2, "0")}:{(seconds % 60).toString().padStart(2, "0")}</span>
      <BotCharacter size={76} />
      <h1>{family ? "가족의 안전 확인 답이 도착했어요" : "기관 사칭이 의심돼요"}</h1>
      <p className={styles.resultLead}>{family ? "가족과 지인이 안전하다고 답한 시연 결과입니다." : "번호 대조 결과와 송금 요구 발언을 함께 확인했어요."}</p>
      <div className={styles.resultEvidence}><h2>{family ? "가족·지인 확인 결과" : "기관 확인 결과"}</h2>{family ? <><p><b>가족 · 가상 회신</b>“저는 무사해요. 돈을 부탁한 적 없어요.”</p><p><b>지인 · 가상 회신</b>“방금 본인과 확인했어요.”</p></> : <><p><b>발신번호 대조</b>시연용 기관 대표번호와 불일치</p><p><b>통화에서 감지한 요구</b>안전계좌 송금 · 주변에 알리지 못하게 통제</p></>}<small>{family ? "실제 가족·지인에게 연락한 결과가 아닙니다." : "번호 불일치만으로 사칭을 확정할 수는 없습니다."}</small></div>
      <p className={styles.reassurance}>많이 놀라셨죠. 바로 행동하지 않고 확인하셨어요. 잠시 숨을 고르고, 돈이나 개인정보는 보내지 마세요.</p>
      <small className={styles.evidence}>가상 대본·확인 결과를 사용한 데모입니다.</small>
      <button className={styles.primary} onClick={() => setResultOpen(false)}>통화 화면으로 돌아가기</button>
    </section> : call === "ended" ? <section className={styles.summary}>
      <BotCharacter size={88} />
      <h1>통화가 종료됐어요</h1>
      <p>{check === "risk" ? "의심스러운 연락은 잠시 멈추고, 공식 연락처로 다시 확인하세요." : "모르는 전화의 금전·개인정보 요구는 별도로 확인하세요."}</p>
      <div className={styles.result}><strong>이번 시연 결과</strong><span>{detected ? "송금 요구·통화 통제 감지 · 보호봇 안내" : lineCount === 3 ? "데모 대본 완료 · 위험 발언 감지 없음" : lineCount > 0 ? "데모 통화 분석 완료 전 종료" : "위험 발언 감지 전 종료"}</span><small>가상 번호와 정해진 대본을 사용한 시연입니다.</small></div>
      <button className={styles.primary} onClick={start}>같은 상황 다시 시연</button>
      <button className={styles.secondary} onClick={() => setCall("ready")}>다른 상황 선택</button>
      <Link href="/live" className={styles.detailLink}>기존 통화 분석 데모 보기</Link>
    </section> : <>
      <section className={`${styles.caller} ${call === "connected" ? styles.connectedCaller : ""}`}>
        <p className={styles.eyebrow}>{call === "connected" ? "통화 중" : "전화가 왔습니다"}</p>
        <div className={styles.avatar}><Phone /></div>
        <h1>010-0000-0000</h1><p>연락처에 없는 번호</p>
        <span className={styles.timer}>{call === "connected" ? `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}` : "대한민국 · 휴대전화"}</span>
      </section>
      <div className={`${styles.check} ${check === "risk" ? styles.risk : ""}`} role="status" aria-live="polite">
        <strong>{check === "waiting" ? "피싱브레이크 보호 활성화" : check === "searching" ? "신고 이력 자동 조회 중…" : check === "risk" ? "주의 · 신고 이력이 있는 번호" : "조회된 신고 이력이 없어요"}</strong>
        <span>{check === "risk" ? "기관 사칭 신고 3건 · 시연 데이터" : check === "clear" ? "이력이 없다고 안전한 번호라는 뜻은 아닙니다." : "모르는 번호를 자동으로 확인합니다."}</span>
        {check === "searching" && <div className={styles.progress} />}
      </div>
      {call === "connected" && <section className={styles.transcript} aria-label="데모 통화 내용">
        <strong>{detected ? "위험 발언 감지" : lineCount === 3 ? "대본 표시 완료" : "통화 내용 확인 중…"}</strong>
        <div aria-live="polite">{lineCount === 0 ? <p>상대방이 말하면 통화 내용이 여기에 표시됩니다.</p> : SCRIPTS[scenario].slice(0, lineCount).map((line, i) => <p key={i} className={detected && i === 2 ? styles.triggerLine : undefined}><small>상대방</small>{line}</p>)}</div>
        <small>시연용 자막 · 실제 음성 인식 없이 대본으로 진행</small>
      </section>}
      {detected && !bot && <button className={styles.reopen} onClick={() => verified ? setResultOpen(true) : setBot(true)}>{verified ? "분석 결과 크게 보기" : "보호봇 확인 진행 중 · 안내 보기"}</button>}
      <div className={styles.controls}>
        {call === "connected" ? <><div className={styles.utilities}><button aria-pressed={muted} onClick={() => setMuted(!muted)}>{muted ? "음소거 켜짐" : "음소거"}</button><button aria-pressed={speaker} onClick={() => setSpeaker(!speaker)}>{speaker ? "스피커 켜짐" : "스피커"}</button></div><button className={`${styles.callButton} ${styles.end}`} onClick={end} aria-label="통화 종료"><Phone end /></button><span>통화 종료</span></> : <div className={styles.answerRow}><div><button className={`${styles.callButton} ${styles.end}`} onClick={end} aria-label="전화 거절"><Phone end /></button><span>거절</span></div><div><button className={`${styles.callButton} ${styles.answer}`} onClick={() => setCall("connected")} aria-label="전화 받기"><Phone /></button><span>받기</span></div></div>}
      </div>
      <p className={styles.disclaimer}>수신 화면 시뮬레이션 · 실제 통화는 연결되지 않습니다.</p>
      {bot && call === "connected" && <aside ref={botRef} className={`${styles.bot} ${styles.careBot}`} aria-label="보호봇 위험 안내">
        <div className={styles.botHeading}><BotCharacter alert={!verified} size={48} /><div><small>피싱브레이크 · 통화 유지 중</small><h2>{verified ? "확인 결과를 함께 볼게요." : "제가 확인할게요. 잠시 기다려 주세요."}</h2></div></div>
        <p className={styles.reassurance} aria-live="polite" aria-atomic="true">{reassurance}</p>
        <div className={styles.verification} role="status" aria-live="polite">
          <strong>{family ? "가족·지인 안전 확인" : "사칭 기관 공식 번호 대조"} <small>시뮬레이션</small></strong>
          <ol>{(family ? ["등록된 가족 연락처 확인", "가족에게 안전 확인 요청", "가까운 지인에게 추가 확인 요청"] : ["통화에서 언급된 기관 확인", "시연용 기관 대표번호 조회", "발신번호와 대표번호 대조"]).map((step, i) => <li key={step}>{verifyStep > i ? "✓" : verifyStep === i ? "◌" : "·"} {step}{verifyStep === i ? " 중…" : ""}</li>)}</ol>
          {verified && <p className={styles.verdict}>{family ? "[가상 회신] 가족: ‘저는 무사해요.’ · 지인: ‘방금 본인과 확인했어요.’ 실제 연락 결과가 아닌 시연 응답입니다." : "[시연 결과] 발신번호가 시연용 대표번호와 달라요. 번호 대조만으로 사칭을 확정할 수는 없지만, 송금 요구는 중단하고 별도로 확인해야 해요."}</p>}
        </div>
        <small className={styles.evidence}>자동 확인 데모 · 실제 번호 조회·전화·메시지 발송 없음</small>
        <button className={styles.secondary} onClick={() => setBot(false)}>안내 접고 통화 화면 보기</button>
      </aside>}
    </>}
  </div>;
}
