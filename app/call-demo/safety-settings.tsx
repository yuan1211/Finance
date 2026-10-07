"use client";
import { useState } from "react";
import { channels, PROFILE_KEY, profileSchema, readProfile, sampleProfile, type SafetyPerson, type SafetyProfile } from "@/lib/safety-agent";
import styles from "./page.module.css";

export default function SafetySettings({ onClose }: { onClose: () => void }) {
  const [profile,setProfile]=useState(readProfile);
  const [notice,setNotice]=useState("");
  const [tab,setTab]=useState(0);
  const [contactIndex,setContactIndex]=useState(0);
  const [routineIndex,setRoutineIndex]=useState(0);
  const [contactDetails,setContactDetails]=useState(false);
  function personFields(p:SafetyPerson,update:(p:SafetyPerson)=>void,isFamily=false) {
    return <div className={styles.profilePerson}>
      <label hidden={!isFamily&&contactDetails}>이름<input required maxLength={30} value={p.name} onChange={e=>update({...p,name:e.target.value})}/></label>
      <label hidden={!isFamily&&contactDetails}>관계<input maxLength={30} value={p.relation} onChange={e=>update({...p,relation:e.target.value})}/></label>
      <label hidden={!isFamily&&contactDetails}>전화번호 (선택)<input type="tel" maxLength={25} value={p.phone} onChange={e=>update({...p,phone:e.target.value})} placeholder="전화번호를 입력해 주세요"/></label>
      {!isFamily&&<><label hidden={contactDetails}>주로 함께 있는 장소<input maxLength={50} value={p.place} onChange={e=>update({...p,place:e.target.value})} placeholder="예: 학교, 직장"/></label><div hidden={!contactDetails} className={styles.formPair}><label>연락 가능 시작<input type="time" required value={p.from} onChange={e=>update({...p,from:e.target.value})}/></label><label>연락 가능 종료<input type="time" required value={p.to} onChange={e=>update({...p,to:e.target.value})}/></label></div></>}
      <label hidden={!isFamily&&!contactDetails} className={styles.checkLabel}><input type="checkbox" checked={p.consent} onChange={e=>update({...p,consent:e.target.checked})}/>안전 확인 연락에 동의함</label>
      <label hidden={!isFamily&&!contactDetails} className={styles.checkLabel}><input type="checkbox" checked={p.app} onChange={e=>update({...p,app:e.target.checked})}/>앱 설치됨</label>
      <div hidden={!isFamily&&!contactDetails} className={styles.channels}>{channels.map(c=><label key={c}><input type="checkbox" disabled={c==="푸시"&&!p.app} checked={p.channels.includes(c)} onChange={e=>update({...p,channels:e.target.checked?[...p.channels,c]:p.channels.filter(v=>v!==c)})}/>{c}</label>)}</div>
    </div>;
  }
  function save(e:React.FormEvent) {
    e.preventDefault();
    const parsed=profileSchema.safeParse({...profile,updatedAt:new Date().toISOString()});
    if(!parsed.success){const path=parsed.error.issues[0]?.path; if(path?.[0]==="family")setTab(0);if(path?.[0]==="routines"){setTab(1);setRoutineIndex(Number(path[1])||0);}if(path?.[0]==="contacts"){setTab(2);setContactIndex(Number(path[1])||0);}setNotice("이름, 일정, 중복 연락처를 확인해 주세요.");return;}
    const people=[profile.family,...profile.contacts];
    const names=people.map(p=>p.name.trim());
    const phones=people.map(p=>p.phone.replace(/\D/g,"")).filter(Boolean);
    if(new Set(names).size!==names.length||new Set(phones).size!==phones.length){setNotice("같은 사람이나 전화번호는 한 번만 등록해 주세요.");return;}
    try {localStorage.setItem(PROFILE_KEY,JSON.stringify(parsed.data));setNotice("저장했어요. 다음 통화부터 적용됩니다.");}catch{setNotice("이 브라우저에서는 저장할 수 없어요. 저장소 설정을 확인해 주세요.");}
  }
  function importContacts(){
    try{const raw=JSON.parse(localStorage.getItem("pb:contacts")||"[]");if(!Array.isArray(raw))throw Error();
      const items=raw.filter((p:Record<string,unknown>)=>typeof p.name==="string"&&typeof p.phone==="string").slice(0,6);
      setProfile({...profile,contacts:items.map((p:Record<string,string>,i:number)=>({id:`import-${i}`,name:p.name.slice(0,30),phone:p.phone.slice(0,25),relation:p.relation||"지인",place:"",consent:false,channels:["전화","문자"],app:false,from:"00:00",to:"23:59"}))});setNotice("불러왔어요. 연락 동의와 함께 있는 장소를 확인한 뒤 저장해 주세요.");
    }catch{setNotice("기존 연락처를 불러올 수 없어요.");}
  }
  return <section className={`${styles.agent} ${styles.settingsWizard}`} aria-label="가족 안전 설정"><h1>가족 안전 설정</h1><small>이 기기에만 저장됩니다.</small><nav className={styles.settingTabs} aria-label="등록 항목">{["가족","일정","주변인","예외","안내"].map((name,i)=><button key={name} type="button" aria-pressed={tab===i} onClick={()=>{setTab(i);setNotice("");}}>{name}</button>)}</nav>
    <form noValidate onSubmit={save} className={styles.settingsForm}>
      <fieldset hidden={tab!==0} className={styles.agentCard}><legend>확인할 가족</legend>{personFields(profile.family,family=>setProfile({...profile,family}),true)}<label className={styles.checkLabel}><input type="checkbox" checked={profile.locationConsent} onChange={e=>setProfile({...profile,locationConsent:e.target.checked})}/>가족이 위치 공유에 동의함</label></fieldset>
      <fieldset hidden={tab!==1} className={styles.agentCard}><legend>평소 일정</legend><label>수정할 일정<select value={Math.min(routineIndex,Math.max(0,profile.routines.length-1))} onChange={e=>setRoutineIndex(Number(e.target.value))}>{profile.routines.map((r,i)=><option key={r.id} value={i}>{r.place||"새 일정"}</option>)}</select></label>{profile.routines.map((r,index)=><div hidden={index!==Math.min(routineIndex,profile.routines.length-1)} className={styles.profilePerson} key={r.id}><label>장소<input required value={r.place} maxLength={50} onChange={e=>setProfile({...profile,routines:profile.routines.map((v,i)=>i===index?{...v,place:e.target.value}:v)})}/></label><div className={styles.dayChoices}>{["일","월","화","수","목","금","토"].map((d,day)=><label key={day}><input type="checkbox" checked={r.days.includes(day)} onChange={e=>setProfile({...profile,routines:profile.routines.map((v,i)=>i===index?{...v,days:e.target.checked?[...v.days,day]:v.days.filter(n=>n!==day)}:v)})}/>{d}</label>)}</div><div className={styles.formPair}>{(["from","to"] as const).map(k=><label key={k}>{k==="from"?"시작":"종료"}<input type="time" required value={r[k]} onChange={e=>setProfile({...profile,routines:profile.routines.map((v,i)=>i===index?{...v,[k]:e.target.value}:v)})}/></label>)}</div><button type="button" className={styles.textButton} onClick={()=>setProfile({...profile,routines:profile.routines.filter((_,i)=>i!==index)})}>이 일정 삭제</button></div>)}<button type="button" className={styles.secondary} disabled={profile.routines.length>=10} onClick={()=>{setRoutineIndex(profile.routines.length);setProfile({...profile,routines:[...profile.routines,{id:crypto.randomUUID(),days:[1,2,3,4,5],from:"09:00",to:"18:00",place:""}]});}}>일정 추가</button>
      </fieldset><fieldset hidden={tab!==3} className={styles.agentCard}><legend>평소와 다른 일정</legend><label>일정이 다른 날 (선택)<input type="date" value={profile.exceptionDate} onChange={e=>setProfile({...profile,exceptionDate:e.target.value})}/></label><label>그날의 장소<input maxLength={50} value={profile.exceptionPlace} onChange={e=>setProfile({...profile,exceptionPlace:e.target.value})} placeholder="예: 현장학습"/></label></fieldset>
      <fieldset hidden={tab!==2} className={styles.agentCard}><legend>함께 확인할 주변인</legend><label>수정할 주변인<select value={Math.min(contactIndex,Math.max(0,profile.contacts.length-1))} onChange={e=>setContactIndex(Number(e.target.value))}>{profile.contacts.map((p,i)=><option key={p.id} value={i}>{p.name||"새 연락처"}</option>)}</select></label><div className={styles.formPair}><button type="button" className={styles.secondary} aria-pressed={!contactDetails} onClick={()=>setContactDetails(false)}>기본 정보</button><button type="button" className={styles.secondary} aria-pressed={contactDetails} onClick={()=>setContactDetails(true)}>연락 설정</button></div><button type="button" className={styles.textButton} onClick={importContacts}>기존 비상연락처 불러오기</button>{profile.contacts.map((p,i)=><div hidden={i!==Math.min(contactIndex,profile.contacts.length-1)} key={p.id}>{personFields(p,value=>setProfile({...profile,contacts:profile.contacts.map((v,j)=>i===j?value:v)}))}<button type="button" className={styles.textButton} onClick={()=>setProfile({...profile,contacts:profile.contacts.filter((_,j)=>j!==i)})}>{p.name||"주변인"} 삭제</button></div>)}<button type="button" className={styles.secondary} disabled={profile.contacts.length>=6} onClick={()=>{setContactIndex(profile.contacts.length);setProfile({...profile,contacts:[...profile.contacts,{id:crypto.randomUUID(),name:"",relation:"지인",phone:"",place:"",consent:false,app:false,channels:["전화","문자"],from:"00:00",to:"23:59"}]});}}>주변인 추가</button></fieldset>
      <label hidden={tab!==4}>원하는 안내 말투<select value={profile.tone} onChange={e=>setProfile({...profile,tone:e.target.value as SafetyProfile["tone"]})}><option value="gentle">따뜻하고 차분하게</option><option value="concise">짧고 명확하게</option></select></label>
      {notice&&<p role="status">{notice}</p>}<div className={styles.formPair}><button className={styles.secondary} type="button" onClick={onClose}>홈으로 돌아가기</button><button className={styles.primary} type="submit">설정 저장</button></div><button hidden={tab!==4} type="button" className={styles.textButton} onClick={()=>{try{localStorage.removeItem(PROFILE_KEY);setProfile(sampleProfile());setNotice("저장된 정보를 삭제하고 기본값으로 초기화했어요.");}catch{setNotice("삭제하지 못했어요. 브라우저 저장소를 확인해 주세요.");}}}>저장된 가족 정보 삭제</button>
    </form>
  </section>;
}
