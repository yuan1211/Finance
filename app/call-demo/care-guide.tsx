"use client";

import { useEffect, useRef, useState } from "react";

import { careChoices, observeCare, type CareState, type SafetyProfile } from "@/lib/safety-agent";

import { createRecognizer, speechFatalMessage, type Recognizer } from "@/lib/speech";

import { createGuidanceUtterance } from "@/lib/speech-out";

import styles from "./page.module.css";

export default function CareGuide({ tone, finished=false, needHelp=false, context="family", demoStage=2, announcement }: { tone: SafetyProfile["tone"]; finished?:boolean; needHelp?:boolean; context?:"family"|"institution"; demoStage?:number; announcement?:{id:string;lines:string[]} }) {

  const [state,setState]=useState<CareState>({stage:2,observations:[],updates:0});

  const [text,setText]=useState("");

  const [last,setLast]=useState("");

  const [ai,setAi]=useState(false);

  const [choice,setChoice]=useState(0);

  const [listening,setListening]=useState(false);

  const [voice,setVoice]=useState(true);

  const [spoken,setSpoken]=useState("");

  const [visible,setVisible]=useState(true);

  const [blocked,setBlocked]=useState(false);

  const [manual,setManual]=useState(0);

  const [error,setError]=useState("");

  const options=useRef<HTMLDialogElement>(null);

  const rec=useRef<Recognizer|null>(null);

  const stage=Math.max(state.stage,demoStage);

  const choices=careChoices(stage,tone,finished);

  const target=context==="institution"?"기관의 공식 정보를":"가족의 안전을";

  const waiting = [

    "놀라셨죠. 아직 확인된 이야기가 아니에요. 송금은 잠깐 멈춰 주세요.",

    context==="institution"?"어르신, 제가 공식 기관 정보를 확인할게요. 상대가 재촉해도 바로 응하지 않으셔도 돼요.":"아드님 이야기라 많이 놀라셨죠. 제가 가족에게 확인하고 있으니 혼자 결정하지 않으셔도 돼요.",

    "코로 두 번 나눠 들이쉬고 길게 내쉬어 보세요. 곁에서 함께할게요.",

    `잘하고 계세요. 지금 ${target} 확인하고 있어요. 차분히 기다려 주세요.`,

    "상대가 전화를 끊지 말라고 해도 따를 필요 없어요. 불편하면 끊으셔도 괜찮아요.",

    "지금은 돈을 보내거나 인증번호를 알려주지 마세요. 확인한 뒤에 차분히 결정하세요.",

    "놀라고 당황하는 건 자연스러워요. 자신을 탓하지 마세요. 제가 함께 확인할게요.",

    context==="institution"?"수사라며 비밀을 요구하고 송금을 재촉하는 건 사기 수법일 수 있어요. 공식 확인을 기다려 주세요.":"가족에게 연락하지 말라는 요구에는 따르지 않아도 돼요. 등록된 연락처로 확인하고 있어요.",

    "천천히 숨을 내쉬고 어깨의 힘을 풀어 보세요. 지금 바로 대답하지 않아도 괜찮아요.",

    "계속 듣는 게 힘드시면 통화를 끊으셔도 돼요. 믿을 수 있는 사람에게 도움을 요청해 주세요.",

    "확인된 답이 오기 전에는 상대의 말만으로 판단하지 않을게요. 곁에서 차분히 도와드릴게요.",

    "잘 기다려 주고 계세요. 휴대전화를 편하게 잡고 잠시 숨을 고르세요.",

  ];

  const focused=stage>=4 ? [

    `${context==="institution"?"어르신":"아버님"}, 제 목소리에 잠시 집중해 주세요. 지금은 돈을 보내지 마세요.`,

    "코로 짧게 숨을 들이쉬세요. 이제 천천히 길게 내쉬어 보세요.",

    "발바닥이 바닥에 닿는 느낌에 집중해 보세요. 저는 곁에 있어요.",

    "휴대전화를 편하게 잡으세요. 어깨의 힘을 조금 풀어 주세요.",

    "손이 떨려도 괜찮아요. 지금 버튼을 누르거나 돈을 옮기지 않으셔도 돼요.",

    context==="institution"?"많이 무서우셨죠. 공식 기관 정보를 확인하고 있으니 자녀에게 이야기하셔도 괜찮아요.":"아드님에게 확인하고 있어요. 혼자 걱정을 감당하지 않으셔도 돼요.",

    "눈앞에 보이는 물건 하나를 천천히 바라보세요. 숨을 길게 내쉬어 주세요.",

    "지금 모든 걸 해결하려 하지 않으셔도 돼요. 제가 확인을 도와드릴게요.",

    "가능하면 가까운 의자에 편하게 앉으세요. 잠시 쉬어 가도 괜찮아요.",

    "믿을 수 있는 가족에게 이 상황을 알려 주세요. 비밀로 하라는 요구에 따르지 마세요.",

  ] : stage>=3 ? [

    `${context==="institution"?"어르신":"아버님"}, 지금 송금 버튼을 누르지 마세요. 제가 함께 확인할게요.`,

    "상대의 요구에 바로 답하지 마세요. 확인할 시간을 가지셔도 돼요.",

    "인증번호는 알려주지 마세요. 휴대전화를 그대로 두셔도 괜찮아요.",

    "혼자 결정하지 마세요. 믿을 수 있는 가족에게 알려 주세요.",

    "상대가 급하다고 해도 돈을 보내지 마세요. 공식 확인을 기다려 주세요.",

    "무서운 말을 들어 놀라셨죠. 아직 사실이 확인된 건 아니에요.",

    "은행 앱은 잠시 닫아 주세요. 지금 이체하지 않으셔도 돼요.",

    "신분증 사진은 보내지 마세요. 제가 확인을 계속 도와드릴게요.",

  ] : [choices[choice]||choices[0]];

  const continued=[

    "지금은 잠시 멈추셔도 돼요. 급한 결정은 혼자 하지 않으셔도 괜찮아요.",

    "상대가 큰 소리를 내더라도 요구에 따를 의무는 없어요. 확인할 시간을 가지세요.",

    "제가 여기 있어요. 불안한 마음을 참으려고 애쓰지 않으셔도 돼요.",

    "입술을 편하게 두고 숨을 천천히 내쉬어 보세요. 조금씩 해도 괜찮아요.",

    "두 손을 편한 곳에 놓아 보세요. 지금 다른 앱을 켜지 않으셔도 돼요.",

    "상대의 주장과 확인된 사실은 달라요. 확인되기 전에는 송금하지 마세요.",

    "통화 내용을 가족에게 알려도 괜찮아요. 혼자 비밀을 지켜야 하는 상황은 아니에요.",

    "지금 개인정보를 입력하지 마세요. 그대로 기다려 주셔도 괜찮아요.",

    "상대가 보내는 링크는 누르지 마세요. 확인은 제가 도와드릴게요.",

    "화면에 낯선 설치 안내가 떠도 누르지 마세요. 지금은 멈춰 계셔도 돼요.",

    "한 번에 하나씩만 해 볼게요. 먼저 돈을 옮기지 않고 기다려 주세요.",

    "많이 놀라서 생각이 정리되지 않을 수 있어요. 급하게 판단하지 않으셔도 돼요.",

    "주변에 믿을 수 있는 사람이 있다면 함께 있어 달라고 말씀해 주세요.",

    "지금 들리는 제 안내를 따라 천천히 숨을 내쉬어 보세요. 서두르지 않으셔도 돼요.",

    "오늘 겪은 일이 본인 잘못은 아니에요. 확인을 요청하신 건 잘하신 일이에요.",

    "기다리는 시간이 불안하게 느껴질 수 있어요. 확인되는 내용부터 차분히 살펴볼게요.",

    "상대가 요구하는 신분증이나 계좌 정보는 보내지 마세요. 그대로 멈춰 주세요.",

    "주변 소리 하나에 잠시 집중해 보세요. 저는 계속 안내해 드릴게요.",

    "급한 마음이 올라오면 다시 숨을 길게 내쉬세요. 지금은 기다려도 괜찮아요.",

    "안전이 걱정되면 믿을 수 있는 사람이나 경찰에게 도움을 요청하셔도 돼요.",

  ];

  const sequence=[...focused,...waiting,...continued];

  const message=finished&&!voice ? choices[choice]||choices[0] : spoken || (finished?choices[choice]||choices[0]:sequence[0]);

  const latest=useRef({finished,sequence,announcement});

  const resume=useRef<(()=>void)|null>(null);

  const used=useRef(new Set<string>());
  const announced=useRef(new Set<string>());

  useEffect(()=>{latest.current={finished,sequence,announcement};resume.current?.();});

  useEffect(()=>{

    const change=()=>setVisible(!document.hidden);

    document.addEventListener("visibilitychange",change);

    return ()=>document.removeEventListener("visibilitychange",change);

  },[]);

  useEffect(()=>{

    if(listening||!visible)return;

    let disposed=false, running=false, scheduled=false;

    let timer:ReturnType<typeof setTimeout>;

    const synth=window.speechSynthesis;

    const schedule=()=>{

      if(disposed||running||scheduled)return;

      scheduled=true;

      timer=setTimeout(()=>{

        scheduled=false;

        if(disposed)return;

        const current=latest.current;
        let line:string|undefined;
        let resultKey:string|undefined;
        if(current.finished){
          if(!voice||!current.announcement)return;
          const index=current.announcement.lines.findIndex((_,i)=>!announced.current.has(`${current.announcement!.id}:${i}`));
          if(index<0)return;
          line=current.announcement.lines[index];
          resultKey=`${current.announcement.id}:${index}`;
          setSpoken("");
        }else{
          line=current.sequence.find(value=>!used.current.has(value));
          if(!line)return;
          setSpoken(line);
        }
        if(!line)return;
        if(!voice){used.current.add(line);scheduled=true;timer=setTimeout(()=>{scheduled=false;schedule();},7000);return;}

        if(!synth){setVoice(false);setBlocked(true);return;}

        running=true;

        const u=createGuidanceUtterance(line);
        if(!u){running=false;setVoice(false);setBlocked(true);setError("한국어 남성 음성을 사용할 수 없어요.");return;}

        if(resultKey)announced.current.add(resultKey);else used.current.add(line);
        u.onend=()=>{

          if(disposed)return;

          running=false;

          if(latest.current.finished)setSpoken("");

          schedule();

        };

        u.onerror=()=>{if(!disposed){running=false;setVoice(false);setBlocked(true);}};

        synth.speak(u);

      },0);

    };

    resume.current=schedule;

    schedule();

    return ()=>{disposed=true;resume.current=null;clearTimeout(timer);synth?.cancel();};

  },[listening,visible,voice]);

  function toggleVoice(){window.speechSynthesis?.cancel();setBlocked(false);setVoice(v=>!v);}

  function respond(value:string){if(!value.trim())return;setLast(value.trim().slice(0,300));setState(s=>observeCare(s,value));setText("");}

  useEffect(()=>()=>{rec.current?.stop();window.speechSynthesis?.cancel();},[]);

  useEffect(()=>{

    if(!ai||!last)return;

    const ctrl=new AbortController();

    fetch("/api/safety-care",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({stage:state.stage,tone,finished,text:last}),signal:ctrl.signal}).then(r=>r.ok?r.json():Promise.reject()).then(r=>setChoice(r.choice===1?1:0)).catch(()=>{});

    return ()=>ctrl.abort();

  },[ai,last,state.stage,tone,finished]);

  function listen(){

    if(listening){rec.current?.stop();setListening(false);return;}

    window.speechSynthesis?.cancel();setError("");

    rec.current=createRecognizer({onFinal:value=>{respond(value);rec.current?.stop();setListening(false);},onInterim:()=>{},onFatal:reason=>{setError(speechFatalMessage(reason));setListening(false);},onListening:setListening});

    if(!rec.current){setError("음성 입력을 지원하지 않는 브라우저예요. 글로 말씀해 주세요.");return;}

    try{rec.current.start();}catch{setError("마이크를 시작할 수 없어요. 글로 말씀해 주세요.");}

  }

  function speak(){if(window.speechSynthesis&&!createGuidanceUtterance(message)){setError("이 브라우저에서 한국어 남성 음성을 찾지 못했습니다.");return;}if(!window.speechSynthesis){setError("이 브라우저는 음성 읽기를 지원하지 않아요.");return;}rec.current?.stop();setListening(false);setVoice(false);setManual(n=>n+1);}

  useEffect(()=>{

    if(!manual)return;

    if(!window.speechSynthesis)return;

    const synth=window.speechSynthesis;

    synth.cancel();

    const u=createGuidanceUtterance(message);
    if(!u)return;
    synth.speak(u);

    return ()=>synth.cancel();

    // Read only on an explicit request, not when the waiting message changes.

    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[manual]);

  return <div className={styles.careGuide}>

    <div className={styles.comfort}><div className={styles.comfortHeading}><strong>지금은 마음을 먼저 돌봐요</strong>{<button type="button" aria-pressed={voice} onClick={toggleVoice}>{blocked?"음성 안내 시작":voice?"음성 안내 끄기":"음성 안내 켜기"}</button>}</div><p className={styles.agentCare} role="status" aria-live="polite">{message}</p></div>

    <div className={styles.formPair}><button className={styles.secondary} onClick={()=>respond("너무 무서워요")}>많이 불안해요</button><button className={styles.secondary} onClick={()=>respond("조금 괜찮아졌어요")}>조금 괜찮아졌어요</button></div>

    {(stage>=4||needHelp)&&<p className={styles.careHint}>힘들면 통화를 끝내셔도 괜찮아요. <a href="tel:112">112 도움 요청</a></p>}

    <button className={styles.textButton} onClick={()=>options.current?.showModal()}>직접 말하기 · 음성 안내</button><dialog ref={options} className={styles.optionsDialog} onClose={()=>{rec.current?.stop();setListening(false);}}><button className={styles.secondary} onClick={()=>options.current?.close()}>닫기</button><h2>직접 말하기 · 음성 안내</h2><form onSubmit={e=>{e.preventDefault();respond(text);}}><label>지금 마음을 말씀해 주세요<input maxLength={300} value={text} onChange={e=>setText(e.target.value)} placeholder="예: 너무 당황해서 어떻게 할지 모르겠어요"/></label><button className={styles.secondary} disabled={!text.trim()}>안내 받기</button></form><div className={styles.formPair}><button className={styles.secondary} onClick={listen}>{listening?"음성 입력 멈추기":"음성으로 말하기"}</button><button className={styles.secondary} onClick={speak}>안내 읽어주기</button></div><small>음성 입력은 브라우저 인식 서버로 전송될 수 있습니다.</small><label className={styles.checkLabel}><input type="checkbox" checked={ai} onChange={e=>setAi(e.target.checked)}/>AI 맞춤 문구 선택 사용</label><small>켜면 입력한 말과 안내 설정을 AI 서버에 전달합니다. 연결할 수 없으면 기본 안내를 사용합니다.</small></dialog>

    {error&&<p className={styles.voiceError} role="alert">{error}</p>}

  </div>;

}
