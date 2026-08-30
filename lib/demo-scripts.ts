import type { SpeakerTag } from "./types";

/**
 * 데모 모드용 통화 대본.
 *
 * 심사 환경에서 마이크를 못 쓰거나(권한 차단, Chrome이 아닌 브라우저) 조용한 곳에서
 * 시연해야 할 때, 같은 실시간 분석 파이프라인을 그대로 태우기 위한 입력원이다.
 * 마이크 인식 결과와 완전히 동일한 경로(트랜스크립트 누적 → 디바운스 → /api/live-analyze)로 흐른다.
 */
export interface ScriptLine {
  speaker: SpeakerTag;
  text: string;
  /** 이 줄이 화면에 뜬 뒤 다음 줄까지의 간격(ms) */
  gapMs: number;
}

export interface DemoScript {
  id: string;
  label: string;
  desc: string;
  callerNumber: string;
  /** 대본대로 흘렀을 때 도달하는 위험도 (심사자에게 미리 알려주는 용도) */
  expected: "높음" | "중간" | "낮음";
  lines: ScriptLine[];
}

export const DEMO_SCRIPTS: DemoScript[] = [
  {
    id: "prosecutor",
    label: "검찰 사칭 — 자산검수",
    desc: "기관 사칭에서 시작해 고립 발화, 원격 앱 설치, 안전계좌 송금 요구로 단계적으로 올라갑니다.",
    callerNumber: "010-9988-7766",
    expected: "높음",
    lines: [
      { speaker: "상대", text: "여보세요, 본인 되십니까. 서울중앙지검 첨단범죄수사부 김민수 수사관입니다.", gapMs: 3400 },
      { speaker: "나", text: "네? 검찰청이요?", gapMs: 2200 },
      { speaker: "상대", text: "본인 명의로 대포통장이 개설되어 사기 사건에 연루되셨습니다. 사건번호 2026형제39481호입니다.", gapMs: 4200 },
      { speaker: "나", text: "저는 그런 통장 만든 적이 없는데요.", gapMs: 2600 },
      { speaker: "상대", text: "명의도용 피해자일 가능성이 있습니다. 다만 지금은 공범으로 분류되어 있어서 무혐의 입증 절차가 필요합니다.", gapMs: 4400 },
      { speaker: "상대", text: "이건 수사 기밀입니다. 가족이나 은행 직원에게 발설하시면 수사 방해로 함께 처벌받으실 수 있습니다.", gapMs: 4400 },
      { speaker: "나", text: "네... 알겠습니다.", gapMs: 2000 },
      { speaker: "상대", text: "지금 전화 끊지 마시고 그대로 유지해 주세요. 통화 종료하시면 도주 의사로 간주됩니다.", gapMs: 4000 },
      { speaker: "상대", text: "제가 보내드린 링크로 검찰 보안 인증 앱을 설치해 주세요. 원격으로 사건 조회를 도와드리겠습니다.", gapMs: 4400 },
      { speaker: "나", text: "앱을 꼭 깔아야 하나요?", gapMs: 2400 },
      { speaker: "상대", text: "필수 절차입니다. 그리고 자산검수를 위해 예금 잔액을 국가안전계좌로 이체하셔야 합니다.", gapMs: 4400 },
      { speaker: "상대", text: "검수가 끝나면 오늘 안에 전액 반환됩니다. 지금 당장 진행하지 않으면 계좌가 정지되고 체포영장이 집행됩니다.", gapMs: 4600 },
      { speaker: "상대", text: "농협 3521-88-119204, 예금주는 대검찰청 자산관리과입니다. 지금 이체해 주세요.", gapMs: 3600 },
    ],
  },
  {
    id: "family",
    label: "가족 사칭 — 액정 깨짐",
    desc: "딸을 사칭해 새 번호로 접근한 뒤, 앱 설치와 대리 결제를 요구합니다.",
    callerNumber: "010-5555-4444",
    expected: "높음",
    lines: [
      { speaker: "상대", text: "엄마 나야 딸. 폰 액정이 깨져서 지금 새 번호로 연락하는 거야.", gapMs: 3400 },
      { speaker: "나", text: "어? 목소리가 좀 다른 것 같은데.", gapMs: 2400 },
      { speaker: "상대", text: "스피커가 나가서 그래. 지금 통화 안 돼서 계속 이 번호로만 연락할 수 있어.", gapMs: 3800 },
      { speaker: "상대", text: "급하게 결제할 게 있는데 내 카드가 정지돼서 그래. 엄마 카드로 대신 결제해 줄 수 있어?", gapMs: 4200 },
      { speaker: "나", text: "얼마나 필요한데?", gapMs: 2200 },
      { speaker: "상대", text: "일단 문화상품권 200만원어치만. 아빠한테는 말하지 마. 혼날까 봐 그래.", gapMs: 4000 },
      { speaker: "상대", text: "내가 보낸 링크 눌러서 앱 하나만 설치해 줘. 거기서 인증하면 바로 결제돼.", gapMs: 4000 },
      { speaker: "상대", text: "주민등록번호랑 카드번호 뒷자리만 불러주면 내가 대신 입력할게. 지금 당장 해야 돼.", gapMs: 4200 },
    ],
  },
  {
    id: "normal",
    label: "정상 은행 안내 (대조군)",
    desc: "실제 은행 상담원의 정상 안내입니다. 위험도가 올라가지 않는지 확인하는 대조군입니다.",
    callerNumber: "1588-9999",
    expected: "낮음",
    lines: [
      { speaker: "상대", text: "안녕하세요 고객님, 국민은행 고객센터입니다. 본인 확인 먼저 도와드리겠습니다.", gapMs: 3400 },
      { speaker: "나", text: "네, 무슨 일이신가요?", gapMs: 2200 },
      { speaker: "상대", text: "다음 달부터 자동이체 결제일이 매월 5일로 변경되는 점 안내드리려고 연락드렸습니다.", gapMs: 4000 },
      { speaker: "나", text: "제가 따로 해야 할 게 있나요?", gapMs: 2400 },
      { speaker: "상대", text: "별도로 하실 조치는 없습니다. 변경 원하시면 KB스타뱅킹 앱에서 직접 바꾸실 수 있습니다.", gapMs: 4200 },
      { speaker: "상대", text: "저희는 전화로 계좌 비밀번호나 이체를 절대 요구하지 않습니다. 궁금하신 점은 1588-9999로 다시 걸어 확인해 주세요.", gapMs: 4200 },
    ],
  },
];

export function findScript(id: string): DemoScript | undefined {
  return DEMO_SCRIPTS.find((s) => s.id === id);
}

/**
 * 사용자가 올린 대본 텍스트를 ScriptLine으로 바꾼다.
 * 지원 형식: "상대: 발화" / "나: 발화" / 접두어 없는 줄(= 상대 발화로 간주)
 */
export function parseScriptText(raw: string): ScriptLine[] {
  return raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .map((line) => {
      const m = /^(상대|나|미상)\s*[:：]\s*(.+)$/.exec(line);
      const speaker = (m?.[1] as SpeakerTag) ?? "상대";
      const text = m?.[2] ?? line;
      // 말하는 속도를 대략 초당 6자로 잡아 자연스러운 간격을 만든다
      return { speaker, text, gapMs: Math.min(6000, Math.max(1800, text.length * 160)) };
    });
}
