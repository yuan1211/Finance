import type { AgentState, SafetyProfile } from "./safety-agent";

export function responseTime(at:number){
  const parts=new Intl.DateTimeFormat("en-US",{timeZone:"Asia/Seoul",hour:"numeric",minute:"numeric",hourCycle:"h23"}).formatToParts(new Date(at));
  const part=(type:string)=>parts.find(p=>p.type===type)?.value||"";
  const hour=Number(part("hour"))%24;
  return `${hour<12?"오전":"오후"} ${hour%12||12}시 ${Number(part("minute"))}분`;
}
const honorific=(name:string)=>name.endsWith("님")?name:`${name}님`;
export function safetyResultSpeech(state:AgentState,profile:SafetyProfile):string[]{
  if(state.phase!=="done")return [];
  const name=honorific(profile.family.name);
  const direct=state.evidence.filter(e=>e.direct);
  const opening=state.result==="confirmed"?`${name}의 안전 확인 답이 도착했어요.`:state.result==="conflict"?"도착한 답변이 서로 달라 추가 확인이 필요해요.":"아직 안전을 확인할 답변이 충분하지 않아요.";
  const replies=direct.map(e=>e.state==="safe"
    ? `${honorific(e.name)}께서 ${responseTime(e.at)}에 ${e.source===profile.family.id?"본인이":`${name}이`} 안전하다고 응답했어요. ${e.quote}`
    : `${honorific(e.name)}께서 ${responseTime(e.at)}에, “${e.quote}”라고 응답했어요.`);
  const closing=state.result==="confirmed"?"서로 다른 두 사람의 직접 확인 답변이 일치해요. 많이 놀라셨죠. 상대의 송금 요구에는 응하지 마세요.":"확인되지 않았다는 이유만으로 위험하다고 단정하지는 않을게요. 송금은 멈추고 추가로 확인해 주세요.";
  return [opening,...replies,closing];
}
