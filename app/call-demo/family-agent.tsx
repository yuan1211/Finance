"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { BotCharacter } from "@/components/bot-character";
import { advanceAgent, planContacts, startAgent, type Outcome, type SafetyProfile } from "@/lib/safety-agent";
import { safetyResultSpeech, responseTime } from "@/lib/safety-result-speech";
import CareGuide from "./care-guide";
import styles from "./page.module.css";
export type FamilyPlan = { outcome: Outcome; useNow: boolean };

export default function FamilyAgent({ plan, profile, seconds, onEnd }: { plan:FamilyPlan; profile:SafetyProfile; seconds:number; onEnd:()=>void }) {
  const [attempt,setAttempt]=useState(0);
  const [state,setState]=useState(()=>startAgent(profile,Date.now()));
  const [notice,setNotice]=useState("");
  const evidenceDialog=useRef<HTMLDialogElement>(null);
  const resultRef=useRef<HTMLDivElement>(null);
  const at=useMemo(()=>plan.useNow?new Date():new Date(2026,9,7,14,0),[plan.useNow]);
  const ranked=useMemo(()=>planContacts(profile,at),[profile,at]);
  const done=state.phase==="done";
  const waiting=state.requests.find(r=>r.status==="waiting");
  useEffect(()=>{
    const id=setInterval(()=>setState(s=>advanceAgent(s,profile,ranked,plan.outcome,Date.now())),400);
    return ()=>clearInterval(id);
  },[profile,ranked,plan.outcome,attempt]);
  useEffect(()=>{if(done){resultRef.current?.focus({preventScroll:true});}},[done]);
  const direct=state.evidence.filter(e=>e.direct);
  function save(){
    const title=state.result==="confirmed"?"복수의 직접 확인 응답 수신":state.result==="conflict"?"응답이 서로 달라 추가 확인 필요":"확인되지 않음";
    const text=["피싱브레이크 가족 안전 확인 기록",new Date().toLocaleString("ko-KR"),title,...state.evidence.map(e=>`${e.name} · ${responseTime(e.at)} · ${e.direct?"직접 응답":"기기 위치(간접 정보)"}\n${e.quote}`)].join("\n\n");
    const url=URL.createObjectURL(new Blob([text],{type:"text/plain;charset=utf-8"}));const a=document.createElement("a");a.href=url;a.download="가족-안전확인.txt";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);setNotice("확인 내용을 저장했어요.");
  }
  return <section className={styles.agent} aria-label="가족 안전 확인 에이전트">
    <span className={styles.ongoing}>● 통화 유지 중 · {Math.floor(seconds/60).toString().padStart(2,"0")}:{(seconds%60).toString().padStart(2,"0")}</span>
    <div className={styles.botHeading}><BotCharacter size={54}/><div><small>피싱브레이크가 함께할게요</small><h1>{done?state.result==="confirmed"?"안전 확인 답이 도착했어요":state.result==="conflict"?"답변이 달라 더 확인해야 해요":"아직 안전을 확인하지 못했어요":"제가 가족에게 확인할게요"}</h1></div></div>
    {!done&&<div className={`${styles.agentCard} ${styles.activeCheck}`} role="status"><small className={styles.checkBadge}>● 안전 확인 중</small><h2>{waiting?`${waiting.name}님에게 확인 중이에요`:"연락할 수 있는 분을 확인하고 있어요"}</h2><p>{waiting?.personId===profile.family.id?"가족 본인의 답변을 기다리고 있어요.":direct.length?"답변이 도착했어요. 다른 분에게도 직접 확인하고 있어요.":"가족에게 아직 답이 없어, 등록된 주변인에게 확인하고 있어요."}</p>{waiting&&<small>{waiting.channels.join(" · ")} 확인 요청</small>}</div>}
    {done&&<div className={`${styles.agentResult} ${state.result!=="confirmed"?styles.unconfirmed:""}`} tabIndex={-1} ref={resultRef} aria-label="가족 확인 결과">
      <h2>{state.result==="confirmed"?"안전 확인 답이 일치해요":state.result==="conflict"?"추가 확인이 필요해요":"확인된 답이 부족해요"}</h2>
      <p>{state.result==="confirmed"?`${profile.family.name}님의 상태를 서로 다른 두 사람이 직접 확인했다고 답했어요.`:state.result==="conflict"?"확인된 답변이 서로 달라요. 상대의 요구대로 행동하지 마세요.":direct.length?"답변은 도착했지만 추가로 확인할 근거가 부족해요.":"응답이 없다는 이유만으로 위험한 상황이라고 판단하지는 않아요."}</p>
      {direct.slice(0,2).map(e=><div key={e.id} className={styles.replyEvidence}><b>{e.name}</b><small> · {e.state==="conflict"?"다른 내용의 응답":"직접 확인 응답"} · {responseTime(e.at)}</small></div>)}
      {direct.length>0&&<button className={styles.textButton} onClick={()=>evidenceDialog.current?.showModal()}>확인 답변 보기</button>}

      {!!state.evidence.find(e=>!e.direct)&&state.result!=="confirmed"&&<p>기기 위치 정보만으로는 사람의 안전을 확인할 수 없어요.</p>}
    </div>}
    <CareGuide needHelp={done&&state.result!=="confirmed"} finished={done} tone={profile.tone} announcement={done?{id:`family:${state.startedAt}:${attempt}`,lines:safetyResultSpeech(state,profile)}:undefined}/>
    {done&&<><div className={styles.formPair}><button className={styles.secondary} onClick={save}>확인 내용 저장</button><button className={styles.secondary} disabled={attempt>=2} onClick={()=>{setState(startAgent(profile,Date.now()));setAttempt(a=>a+1);setNotice("");}}>다시 확인</button></div></>}
    <dialog ref={evidenceDialog} className={styles.optionsDialog}><button className={styles.secondary} onClick={()=>evidenceDialog.current?.close()}>닫기</button><h2>도착한 확인 답변</h2>{direct.map(e=><div key={e.id} className={styles.replyEvidence}><b>{e.name}</b><p>“{e.quote}”</p><small>{responseTime(e.at)}</small></div>)}</dialog>
    {notice&&<p role="status">{notice}</p>}
    <button className={styles.secondary} onClick={onEnd}>통화 종료</button>
  </section>;
}
