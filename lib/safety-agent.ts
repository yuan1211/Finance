import { z } from "zod";

export const channels = ["전화", "문자", "푸시"] as const;
const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const person = z.object({
  id: z.string().min(1).max(80), name: z.string().trim().min(1).max(30), relation: z.string().max(30),
  phone: z.string().max(25), place: z.string().max(50), consent: z.boolean(),
  channels: z.array(z.enum(channels)).max(3), app: z.boolean(),
  from: clock, to: clock,
});
const routine = z.object({ id: z.string(), days: z.array(z.number().int().min(0).max(6)).min(1).max(7), from: clock, to: clock, place: z.string().trim().min(1).max(50) });
export const profileSchema = z.object({
  version: z.literal(1), family: person, contacts: z.array(person).max(6), routines: z.array(routine).max(10),
  exceptionDate: z.string().max(10), exceptionPlace: z.string().max(50),
  tone: z.enum(["gentle", "concise"]), locationConsent: z.boolean(), updatedAt: z.union([z.literal(""),z.string().datetime()]),
}).superRefine((p,ctx)=>{
  const people=[p.family,...p.contacts];
  for(const field of ["id","name","phone"] as const){
    const values=people.map(v=>field==="phone"?v[field].replace(/\D/g,""):v[field].trim()).filter(Boolean);
    if(new Set(values).size!==values.length)ctx.addIssue({code:"custom",message:"연락 대상이 중복되어 있습니다."});
  }
  if(Boolean(p.exceptionDate)!==Boolean(p.exceptionPlace.trim()))ctx.addIssue({code:"custom",message:"예외 일정 날짜와 장소를 함께 입력해 주세요."});
  if(p.exceptionDate&&!/^\d{4}-\d{2}-\d{2}$/.test(p.exceptionDate))ctx.addIssue({code:"custom",message:"날짜 형식을 확인해 주세요."});
});
export type SafetyProfile = z.infer<typeof profileSchema>;
export type SafetyPerson = SafetyProfile["family"];
export const PROFILE_KEY = "pb:safety-profile:v1";
export function sampleProfile(): SafetyProfile {
  const base = { phone: "", consent: true, channels: ["전화", "문자"] as SafetyPerson["channels"], app: false, from: "00:00", to: "23:59" };
  return { version: 1, family: { ...base, id: "self", name: "민준", relation: "가족", place: "", app: true, channels: ["전화", "문자", "푸시"] },
    contacts: [
      { ...base, id: "teacher", name: "김선생님", relation: "담임 선생님", place: "학교", from: "08:00", to: "17:00" },
      { ...base, id: "colleague", name: "이동료", relation: "직장 동료", place: "직장", from: "09:00", to: "18:00" },
      { ...base, id: "friend", name: "박친구", relation: "친구", place: "학교" },
    ], routines: [{ id: "school", days: [1,2,3,4,5], from: "08:30", to: "16:00", place: "학교" }],
    exceptionDate: "", exceptionPlace: "", tone: "gentle", locationConsent: false, updatedAt: "" };
}
export function readProfile(): SafetyProfile {
  try { const raw = localStorage.getItem(PROFILE_KEY); if (raw) { const parsed = profileSchema.safeParse(JSON.parse(raw)); if (parsed.success) return parsed.data; } } catch { /* use an explicit sample */ }
  return sampleProfile();
}
export function timeAllowed(from: string, to: string, at: string) {
  return from <= to ? at >= from && at <= to : at >= from || at <= to;
}
export function usableChannels(p: SafetyPerson) { return p.consent ? p.channels.filter(c => c !== "푸시" || p.app) : []; }
export function localDate(d: Date) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
export function planContacts(profile: SafetyProfile, at: Date) {
  const time = `${String(at.getHours()).padStart(2,"0")}:${String(at.getMinutes()).padStart(2,"0")}`;
  const places = profile.exceptionDate === localDate(at) && profile.exceptionPlace ? [profile.exceptionPlace] : profile.routines.filter(r => r.days.includes(at.getDay()) && timeAllowed(r.from, r.to, time)).map(r => r.place);
  // Deterministic preference score, never presented as a learned probability.
  const fresh = profile.updatedAt && Number.isFinite(Date.parse(profile.updatedAt)) && at.getTime() - Date.parse(profile.updatedAt) > 90 * 86400000 ? 0.5 : 1;
  return profile.contacts.filter(p => usableChannels(p).length && timeAllowed(p.from,p.to,time)).map((p,index) => ({ person: p, score: (places.includes(p.place) ? 2 * fresh : 0) + 1 / (index+2) })).sort((a,b) => b.score-a.score).map(p => p.person);
}

export type Outcome = "self" | "nearby" | "second" | "conflict" | "unknown" | "location";
export type Evidence = { id: string; source: string; name: string; at: number; direct: boolean; state: "safe" | "uncertain" | "conflict"; place?: string; quote: string; simulated: true };
export type RequestRecord = { id: string; personId: string; name: string; channels: string[]; status: "waiting" | "timeout" | "replied" | "cancelled"; at: number };
export type AgentState = { phase: "self" | "contacts" | "done"; result: "pending" | "confirmed" | "conflict" | "unconfirmed"; index: number; nextAt: number; startedAt: number; evidence: Evidence[]; requests: RequestRecord[]; locationAdded: boolean };
export function assess(evidence: Evidence[], now: number): AgentState["result"] {
  const current = evidence.filter(e => now-e.at < 5*60000 && now>=e.at);
  const direct = current.filter(e=>e.direct);
  const directPlaces = new Set(direct.filter(e=>e.state==="safe" && e.place).map(e=>e.place));
  if (direct.some(e=>e.state==="conflict") || directPlaces.size>1) return "conflict";
  // A handset location and its owner's reply are not independent sources.
  const independent = new Set(direct.filter(e=>e.state==="safe").map(e=>e.source));
  return independent.size>=2 ? "confirmed" : "pending";
}
const WAIT = 4500;
function request(p: SafetyPerson, now: number): RequestRecord {
  return { id: `${p.id}:${now}`, personId:p.id, name:p.name, channels:usableChannels(p), status:"waiting", at:now };
}
export function startAgent(profile: SafetyProfile, now: number): AgentState {
  const allowed = usableChannels(profile.family).length>0;
  return { phase:allowed?"self":"contacts",result:"pending",index:0,nextAt:now+(allowed?WAIT:0),startedAt:now,evidence:[],requests:allowed?[request(profile.family,now)]:[],locationAdded:false };
}
export function advanceAgent(s: AgentState, profile: SafetyProfile, ranked: SafetyPerson[], outcome: Outcome, now: number): AgentState {
  if (s.phase==="done") return s;
  let next = s;
  if (profile.locationConsent && !s.locationAdded && now-s.startedAt>=2000) {
    next={...s,locationAdded:true,evidence:[...s.evidence,{id:"gps",source:profile.family.id,name:`${profile.family.name} 기기`,at:now,direct:false,state:"uncertain",place:"등록 장소 주변",quote:"기기 위치 수신 · 사람의 안전을 확인한 정보는 아닙니다.",simulated:true}]};
  }
  if(now<next.nextAt) return next;
  const finish=(state:AgentState):AgentState=>({...state,phase:"done",result:assess(state.evidence,now)==="pending"?"unconfirmed":assess(state.evidence,now),requests:state.requests.map(r=>r.status==="waiting"?{...r,status:"cancelled"}:r)});
  const addReply=(state:AgentState,p:SafetyPerson,uncertain=false):AgentState=>({...state,evidence:[...state.evidence,{id:`reply:${p.id}`,source:p.id,name:p.name,at:now,direct:true,state:uncertain?"conflict":"safe",place:uncertain?undefined:(ranked[0]?.place||"확인된 장소"),quote:uncertain?"지금 집에서 함께 있어요. 앞서 전달된 장소와 달라요.":p.id===profile.family.id?"저는 괜찮아요. 돈을 부탁하지 않았어요.":`${profile.family.name}님과 지금 함께 있어요. 직접 확인했어요.`,simulated:true}],requests:state.requests.map(r=>r.personId===p.id&&r.status==="waiting"?{...r,status:"replied"}:r)});
  if(next.phase==="self") {
    next=outcome==="self"?addReply(next,profile.family):{...next,requests:next.requests.map(r=>({...r,status:"timeout"}))};
    next={...next,phase:"contacts",index:0};
  } else {
    const current=ranked[next.index];
    const waiting=next.requests.some(r=>r.personId===current?.id&&r.status==="waiting");
    if(current&&waiting){
      const replies=outcome==="self"||outcome==="nearby"||outcome==="conflict"||(outcome==="second"&&next.index>0);
      next=replies?addReply(next,current,outcome==="conflict"&&next.index===1):{...next,requests:next.requests.map(r=>r.personId===current.id?{...r,status:"timeout"}:r)};
      next={...next,index:next.index+1};
    }
  }
  const result=assess(next.evidence,now);
  if(result==="confirmed") return finish(next);
  const target=ranked[next.index];
  if(!target||now-next.startedAt>=45000) return finish(next);
  // Recheck consent and availability immediately before every request.
  if(!usableChannels(target).length) return finish(next);
  if(next.requests.some(r=>r.personId===target.id)) return finish(next);
  return {...next,result,nextAt:now+WAIT,requests:[...next.requests,request(target,now)]};
}

export type CareState = { stage:number; observations:number[]; updates:number };
export function observeCare(s:CareState,text:string):CareState {
  const target=/아무것도 못|도와주세요|못하겠/.test(text)?5:/너무 무서|숨.*막|떨려|울고/.test(text)?4:/불안|무서|어떡|당황/.test(text)?3:/괜찮아|안심|진정됐/.test(text)?1:/걱정|긴장/.test(text)?2:null;
  if(target===null||s.updates>=30) return s;
  const observations=[...s.observations,target].slice(-3);
  const average=Math.round(observations.reduce((a,b)=>a+b,0)/observations.length);
  return {stage:s.stage+Math.sign(average-s.stage),observations,updates:s.updates+1};
}
export function careChoices(stage:number,tone:SafetyProfile["tone"],finished=false) {
  const opening=finished?"혼자 결정하지 않아도 괜찮아요.":tone==="concise"?"제가 함께 확인하고 있어요.":stage>=4?"지금 많이 힘드실 것 같아요.":"많이 놀라셨죠.";
  const action=stage>=5?"통화를 끝내고 믿을 수 있는 사람에게 도움을 요청해 주세요.":stage>=4?"가능하면 편한 자세로 잠시 쉬어 주세요.":finished?"돈이나 개인정보를 요구하면 응하지 마세요.":"확인하는 동안 송금은 잠시 멈춰 주세요.";
  return [`${opening} ${action}`,`곁에서 차분히 도와드릴게요. ${action}`];
}
