"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { BotCharacter } from "@/components/bot-character";
import styles from "./page.module.css";

import FamilyAgent, { type FamilyPlan } from "./family-agent";

import CareGuide from "./care-guide";
import { warmUpVoices } from "@/lib/speech-out";
import { readProfile, sampleProfile, type SafetyProfile } from "@/lib/safety-agent";

type Check = "waiting" | "searching" | "risk" | "clear";
type Call = "ready" | "incoming" | "connected" | "ended";

const SCRIPTS = {
  risk: [
    {who:"검찰 사칭범",text:"어르신, 서울중앙지검 수사관이라고 합니다. 어르신 명의 통장이 범죄에 쓰여서 조사 중입니다."},
    {who:"할머니 · 70대",text:"제 통장이 범죄에 쓰였다고요? 저는 그런 일 한 적이 없는데요. 잘못 아신 것 아닐까요?"},
    {who:"검찰 사칭범",text:"협조하지 않으면 조사받으러 오셔야 합니다. 수사 중이니 자녀나 은행에는 말하지 마세요."},
    {who:"할머니 · 불안 고조",text:"경찰이 오는 건가요? 머리가 멍해서 무슨 말씀인지 모르겠어요. 제가 뭘 해야 하죠?"},
    {who:"검찰 사칭범",text:"제가 시키는 대로만 하세요. 은행 앱을 열고 모아 둔 돈을 안전계좌로 보내세요. 지금 해야 합니다."},
    {who:"할머니 · 불안 고조",text:"네, 보내면 되는 건가요? 판단이 안 돼요. 아들한테 물어보고 싶은데 안 된다고 하시니…"},
    {who:"검찰 사칭범",text:"가족에게 알리지 말라고 했습니다. 지금 송금하세요. 전화를 끊으면 수사에 문제가 생깁니다."},
    {who:"할머니 · 심한 동요",text:"숨이 가쁘고 손이 떨려요. 전화도 제대로 못 잡겠어요. 아무 생각이 안 나요. 아들한테 연락하고 싶어요."},
  ],
  kidnap: [
    {who:"납치 협박범",text:"당신 아들을 데리고 있습니다. 아버지 맞죠? 지금부터 제 말대로 하세요."},
    {who:"아버지 · 50대",text:"우리 아들이요? 학교에 있을 텐데요. 아들 목소리부터 들려주세요."},
    {who:"납치 협박범",text:"말 시키지 마세요. 아들을 무사히 보고 싶으면 지금 돈을 준비하세요. 가족이나 경찰에 알리면 안 됩니다."},
    {who:"아버지 · 50대",text:"정말 우리 아들이 맞습니까? 다친 건 아니죠? 제가 직접 전화해 보겠습니다."},
    {who:"납치 협박범",text:"아들에게 전화하지 마세요. 확인하려고 연락하면 가만두지 않겠습니다. 삼백만 원을 보내세요."},
    {who:"아버지 · 50대",text:"너무 갑작스러워서 정신이 없네요. 돈을 보내기 전에 아이가 괜찮은지 알아야겠습니다."},
    {who:"납치 협박범",text:"시간 없습니다. 지금 송금하세요. 전화를 끊거나 다른 사람에게 연락하지 마세요."},
    {who:"아버지 · 50대",text:"잠깐만요. 아이 상태부터 확인하겠습니다. 급하게 돈부터 보낼 수는 없습니다."},
  ],
};
const DEMO_LINE_MS=3000;
const DETECTION_MS=DEMO_LINE_MS*8+1000;

function Phone({ end = false }: { end?: boolean }) {
  return <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden style={{ transform: end ? "rotate(135deg)" : undefined }}><path d="M7 3 4 4c-2 1 0 7 4 11s10 6 11 4l1-3-5-3-2 2c-2-1-3-2-4-4l2-2-4-6Z" fill="currentColor" /></svg>;
}

export default function CallDemo() {
  const [call, setCall] = useState<Call>("ready");
  const [check, setCheck] = useState<Check>("waiting");
  const [scenario, setScenario] = useState<"risk" | "kidnap">("risk");

  const [familyPlan, setFamilyPlan] = useState<FamilyPlan>({ outcome: "nearby", useNow: false });
  const [profile, setProfile] = useState<SafetyProfile>(sampleProfile);
  const [verifyStep, setVerifyStep] = useState(0);
  const [resultOpen, setResultOpen] = useState(false);
  const resultRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (resultOpen) {
      resultRef.current?.scrollIntoView({ block: "start" });
      resultRef.current?.focus({ preventScroll: true });
    }
  }, [resultOpen]);
  const [seconds, setSeconds] = useState(0);
  const [muted, setMuted] = useState(false);
  const [speaker, setSpeaker] = useState(false);
  const [lineCount, setLineCount] = useState(0);
  const transcriptRef=useRef<HTMLDivElement>(null);
  useEffect(()=>{const box=transcriptRef.current;if(box)box.scrollTop=box.scrollHeight;},[lineCount]);
  const [detected, setDetected] = useState(false);
  const active = call === "incoming" || call === "connected";
  const family = scenario === "kidnap";
  const verified = verifyStep === 3;

  useEffect(() => {
    if (call !== "connected" || !detected || family) return;
    const timers = [3000, 6500, 11000].map((delay, i) =>
      setTimeout(() => {
        setVerifyStep(i + 1);
        if (i === 2) { setResultOpen(true); }
      }, delay),
    );
    return () => timers.forEach(clearTimeout);
  }, [call, detected, family]);

  useEffect(() => {
    if (!active || check !== "waiting") return;
    const id = setTimeout(() => setCheck("searching"), 300);
    return () => clearTimeout(id);
  }, [active, check]);
  useEffect(() => {
    if (!active || check !== "searching") return;
    const id = setTimeout(() => setCheck(scenario === "risk" ? "risk" : "clear"), 900);
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
    const timers = SCRIPTS[scenario].map((_, i) =>
      setTimeout(() => setLineCount(i + 1), DEMO_LINE_MS*(i+1)),
    );
    timers.push(setTimeout(() => {
      setDetected(true);
    }, DETECTION_MS));
    return () => timers.forEach(clearTimeout);
  }, [call, scenario]);

  function start() {
    setProfile(readProfile());
    setResultOpen(false);
    setCheck("waiting"); setSeconds(0); setMuted(false); setSpeaker(false); setLineCount(0); setDetected(false); setVerifyStep(0); setCall("incoming");
  }
  function end() { setCall("ended"); setResultOpen(false); }

  return <div className={`${styles.screen} ${call==="connected"&&!detected?styles.connectedScreen:""}`}>
    <div className={styles.top}><Link href="/" aria-label="홈으로 돌아가기">‹</Link><span>피싱브레이크 <b>통화 보호</b></span><span className={styles.dot} /></div>
    {call === "ready" ? <section className={styles.intro}>
      <div className={styles.heroIcon}><Phone /></div>
      <p className={styles.eyebrow}>전화가 오는 순간부터</p>
      <h1>통화를 듣고,<br />위험한 순간 알려드려요.</h1>
      <p className={styles.description}>앱을 열지 않아도 모르는 번호를 확인하고<br />전화 화면 위에서 위험을 알려주는 경험.</p>
      <ol className={styles.steps}><li>전화 받기 · 위험 발언 감지</li><li>봇이 기관 또는 가족·지인 확인</li></ol>
      <fieldset className={styles.scenarios}><legend>통화 상황</legend><label><input type="radio" name="scenario" checked={scenario === "risk"} onChange={() => setScenario("risk")} />기관 사칭 · 할머니에게 송금 요구</label><label><input type="radio" name="scenario" checked={scenario === "kidnap"} onChange={() => setScenario("kidnap")} />납치 협박 · 아버지에게 아들 안전 위협</label></fieldset>
      {family && <details className={styles.demoOptions}><summary>응답 설정</summary><label>응답 상황<select value={familyPlan.outcome} onChange={e => setFamilyPlan({ ...familyPlan, outcome: e.target.value as FamilyPlan["outcome"] })}><option value="nearby">본인 무응답 · 주변인에게 확인</option><option value="self">본인 응답 · 주변인과 재확인</option><option value="second">첫 주변인 무응답 · 다음 분에게 확인</option><option value="conflict">서로 다른 답변</option><option value="unknown">모두 응답 없음</option><option value="location">위치만 확인됨 (위치 동의 필요)</option></select></label><label className={styles.checkLabel}><input type="checkbox" checked={familyPlan.useNow} onChange={e=>setFamilyPlan({...familyPlan,useNow:e.target.checked})}/>현재 날짜와 시간 사용</label><small>기준 시각: 수요일 오후 2시.</small></details>}
      <button className={styles.primary} onClick={start}>전화 받기 시작</button>
    </section> : family && detected && call === "connected" ? <FamilyAgent plan={familyPlan} profile={profile} seconds={seconds} onEnd={end} /> : !family && detected && call === "connected" ? <section className={styles.agent} aria-label="기관 확인 안내" ref={resultRef} tabIndex={-1}>
      <span className={styles.ongoing}>● 통화 유지 중 · {Math.floor(seconds / 60).toString().padStart(2, "0")}:{(seconds % 60).toString().padStart(2, "0")}</span>
      <div className={styles.botHeading}><BotCharacter size={54} /><h1>{verified ? "기관 사칭이 의심돼요" : "제가 기관에 확인할게요"}</h1></div>
      <div className={verified ? `${styles.agentResult} ${styles.dangerResult}` : `${styles.agentCard} ${styles.activeCheck}`}><h2>{verified ? "송금 요구에 응하지 마세요" : "공식 기관 정보를 확인 중이에요"}</h2><p>{verified ? "발신번호가 기관 대표번호와 다르고, 송금을 재촉하며 주변에 알리지 못하게 하고 있어요." : "상대가 말한 기관의 번호를 확인하고 있어요. 지금 바로 결정하지 않으셔도 괜찮아요."}</p>{verified && <small>번호 불일치만으로 사칭을 확정할 수는 없습니다.</small>}</div>
      <CareGuide finished={verified} tone={profile.tone} context="institution" demoStage={verifyStep>=1?4:3} announcement={verified?{id:"institution-result",lines:["기관 확인 결과를 알려드릴게요.","발신번호가 기관 대표번호와 다르고, 송금과 비밀 유지를 요구하고 있어요. 기관 사칭이 의심됩니다.","번호가 다르다는 이유만으로 사칭을 확정할 수는 없지만, 지금 송금하지 마세요. 공식 연락처로 다시 확인해 주세요."]}:undefined} />
      <button className={styles.secondary} onClick={end}>통화 종료</button>
    </section> : call === "ended" ? <section className={styles.summary}>
      <BotCharacter size={88} />
      <h1>통화가 종료됐어요</h1>
      <p>{check === "risk" ? "의심스러운 연락은 잠시 멈추고, 공식 연락처로 다시 확인하세요." : "모르는 전화의 금전·개인정보 요구는 별도로 확인하세요."}</p>
      <div className={styles.result}><strong>통화 결과</strong><span>{detected ? "송금 요구·통화 통제 감지 · 보호봇 안내" : lineCount === SCRIPTS[scenario].length ? "통화 분석 완료 · 위험 발언 감지 없음" : lineCount > 0 ? "통화 분석 완료 전 종료" : "위험 발언 감지 전 종료"}</span></div>
      <button className={styles.primary} onClick={start}>같은 상황 다시 시작</button>
      <button className={styles.secondary} onClick={() => setCall("ready")}>다른 상황 선택</button>
      <Link href="/live" className={styles.detailLink}>통화 분석 보기</Link>
    </section> : <>
      <section className={`${styles.caller} ${call === "connected" ? styles.connectedCaller : ""}`}>
        <p className={styles.eyebrow}>{call === "connected" ? "통화 중" : "전화가 왔습니다"}</p>
        <div className={styles.avatar}><Phone /></div>
        <h1>010-5236-9425</h1><p>연락처에 없는 번호</p>
        <span className={styles.timer}>{call === "connected" ? `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}` : "대한민국 · 휴대전화"}</span>
      </section>
      <div className={`${styles.check} ${check === "risk" ? styles.risk : ""}`} role="status" aria-live="polite">
        <strong>{check === "waiting" ? "피싱브레이크 보호 활성화" : check === "searching" ? "신고 이력 자동 조회 중…" : check === "risk" ? "주의 · 신고 이력이 있는 번호" : "조회된 신고 이력이 없어요"}</strong>
        <span>{check === "risk" ? "기관 사칭 신고 3건" : check === "clear" ? "이력이 없다고 안전한 번호라는 뜻은 아닙니다." : "모르는 번호를 자동으로 확인합니다."}</span>
        {check === "searching" && <div className={styles.progress} />}
      </div>
      {call === "connected" && <section className={styles.transcript} aria-label="통화 내용">
        <strong>{detected ? "위험 발언 감지" : lineCount === SCRIPTS[scenario].length ? "통화 내용 확인 완료" : "통화 내용 확인 중…"}</strong>
        <div ref={transcriptRef} aria-live="polite">{lineCount === 0 ? <p>상대방이 말하면 통화 내용이 여기에 표시됩니다.</p> : SCRIPTS[scenario].slice(0, lineCount).map((line, i) => <p key={i} className={detected && [2,4,6].includes(i) ? styles.triggerLine : undefined}><small>{line.who}</small>{line.text}</p>)}</div>
        
      </section>}

      <div className={styles.controls}>
        {call === "connected" ? <><div className={styles.utilities}><button aria-pressed={muted} onClick={() => setMuted(!muted)}>{muted ? "음소거 켜짐" : "음소거"}</button><button aria-pressed={speaker} onClick={() => setSpeaker(!speaker)}>{speaker ? "스피커 켜짐" : "스피커"}</button></div><button className={`${styles.callButton} ${styles.end}`} onClick={end} aria-label="통화 종료"><Phone end /></button><span>통화 종료</span></> : <div className={styles.answerRow}><div><button className={`${styles.callButton} ${styles.end}`} onClick={end} aria-label="전화 거절"><Phone end /></button><span>거절</span></div><div><button className={`${styles.callButton} ${styles.answer}`} onClick={() => {warmUpVoices();setCall("connected");}} aria-label="전화 받기"><Phone /></button><span>받기</span></div></div>}
      </div>
    </>}
  </div>;
}
