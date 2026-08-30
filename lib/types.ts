// 피싱브레이크 공통 타입 정의
// 주의: 사용자가 입력한 통화/문자 원문은 서버에 저장하지 않으며,
// 브라우저 sessionStorage 안에서만 케이스 단위로 유지됩니다.

export type RiskLevel = "낮음" | "중간" | "높음";

export type ScamType =
  | "기관 사칭"
  | "가족·지인 사칭"
  | "대출 사기"
  | "투자·리딩방 사기"
  | "택배·결제 스미싱"
  | "로맨스 스캠"
  | "판단 보류";

export interface DetectedSignal {
  /** 원문에서 발견된 위험 신호 문구 */
  keyword: string;
  /** 신호 분류 (예: 기관 사칭, 원격제어 유도, 통제 발화) */
  category: string;
  /** 왜 위험한지 한 문장 설명 */
  explanation: string;
}

/** 위험 점수를 구성하는 개별 요인 하나 */
export interface ScoreFactor {
  label: string;
  points: number;
  /** 이 요인이 잡힌 근거 (원문에 등장한 표현, 신고 건수 등) */
  detail: string;
}

/**
 * 결정론적 점수 분해.
 * LLM이 최종 점수를 매겼더라도 이 분해는 규칙 기반으로 따로 계산해 함께 보여 준다.
 */
export interface ScoreBreakdown {
  factors: ScoreFactor[];
  /** 요인 점수의 단순 합 (100을 넘을 수 있다) */
  subtotal: number;
  /** 0~100으로 자른 값 */
  capped: number;
}

export interface RiskAnalysis {
  riskLevel: RiskLevel;
  /** 0~100 위험 점수 */
  riskScore: number;
  scamType: ScamType;
  detectedSignals: DetectedSignal[];
  /** 종합 판단 근거 (2~4문장) */
  reasoning: string;
  /** 지금 당장 하지 말아야 할 것 / 해야 할 것 */
  immediateAdvice: string[];
  /** 사용자에게 건네는 첫 안정화 메시지 */
  calmMessage: string;
  /** 왜 이 점수인지에 대한 규칙 기반 분해 (구버전 세션에는 없을 수 있다) */
  scoreBreakdown?: ScoreBreakdown;
  /** 분석 엔진: claude = LLM, fallback = 룰 기반 */
  engine: "claude" | "fallback";
}

export type ChannelType = "통화" | "문자";

export interface SituationInput {
  channel: ChannelType;
  /** 통화 내용 요약 또는 문자 원문 */
  content: string;
  /** 발신번호 (선택) */
  callerNumber?: string;
  /** 상대가 알려준 계좌번호 (선택) */
  accountNumber?: string;
  /** 상대가 밝힌 소속 (선택) */
  claimedOrg?: string;
}

export type VerifyStatus = "pending" | "running" | "danger" | "warning" | "clear";

export interface VerifyStepResult {
  id: "reported" | "official" | "notify";
  title: string;
  status: VerifyStatus;
  /** 화면에 보여줄 핵심 결과 한 줄 */
  headline: string;
  /** 상세 근거 목록 */
  details: string[];
}

export interface EmergencyContact {
  id: string;
  name: string;
  relation: string;
  phone: string;
  /** 실제 알림 발송에 쓰이는 이메일 (선택). 없으면 시뮬레이션으로만 처리된다. */
  email?: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface TimelineEntry {
  time: string;
  title: string;
  detail: string;
}

export interface FollowUpReport {
  timeline: TimelineEntry[];
  /** 신고 시 필요한 사실관계만 정리 */
  facts: string[];
  /** 다음에 해야 할 행동 안내 */
  actions: { title: string; detail: string }[];
  summary: string;
  engine: "claude" | "fallback";
}

/** 세션 내에서만 유지되는 케이스 전체 상태 */
export interface CaseState {
  createdAt: string;
  input: SituationInput | null;
  analysis: RiskAnalysis | null;
  verification: VerifyStepResult[];
  chat: ChatMessage[];
  report: FollowUpReport | null;
}

/* ------------------------------------------------------------------ *
 * 실시간 통화 분석 (방식 A: 브라우저 마이크 + Web Speech API)
 * ------------------------------------------------------------------ */

export type SpeakerTag = "상대" | "나" | "미상";

export interface TranscriptSegment {
  id: string;
  /** 세션 시작 후 경과 시간(ms) */
  at: number;
  speaker: SpeakerTag;
  text: string;
}

/** 위험도가 직전 호출 대비 어떻게 움직였는지 */
export type RiskTrend = "상승" | "유지" | "하락";

/**
 * 보이스피싱 시나리오 단계.
 * 범죄 조직은 대본을 따라 움직인다. 지금 어느 단계인지 알면 "다음에 무엇을 요구할지"를
 * 미리 말해 줄 수 있고, 이것이 단순 위험 점수보다 훨씬 실질적인 경고가 된다.
 */
export type ScamStage = "미확인" | "접근" | "신뢰구축" | "고립" | "압박" | "편취";

/** 진행 순서. 인덱스가 곧 진행도이며, 단계는 뒤로 되돌아가지 않는다. */
export const SCAM_STAGES: ScamStage[] = ["미확인", "접근", "신뢰구축", "고립", "압박", "편취"];

export const STAGE_DESC: Record<ScamStage, string> = {
  미확인: "아직 판단할 만한 발화가 쌓이지 않았습니다.",
  접근: "신분을 밝히며 접근하는 단계입니다.",
  신뢰구축: "사건·피해 상황을 설명하며 자신을 믿게 만드는 단계입니다.",
  고립: "주변에 확인하지 못하도록 차단하는 단계입니다. 가장 위험한 전환점입니다.",
  압박: "시간과 불이익으로 몰아붙이며 앱 설치·정보 제공을 요구하는 단계입니다.",
  편취: "실제로 돈을 옮기게 하는 단계입니다. 지금 멈춰야 합니다.",
};

/** 실시간 분석 1회의 결과 */
export interface LiveRiskUpdate {
  riskLevel: RiskLevel;
  riskScore: number;
  trend: RiskTrend;
  /** 이번 구간에서 "새로" 감지된 신호만 (누적 신호를 반복 나열하지 않는다) */
  newSignals: DetectedSignal[];
  /** 지금 개입(통화 중단 + 역검증)이 필요한지 */
  shouldIntervene: boolean;
  /** 위험도가 이렇게 움직인 이유 1~2문장 */
  reason: string;
  /** 화면 배너에 띄울 짧은 지시 문구 (1문장) */
  liveMessage: string;
  scamType: ScamType;
  /** 지금 통화가 시나리오의 어느 단계까지 왔는지 */
  scamStage: ScamStage;
  /** 이 단계 다음에 나올 가능성이 높은 요구 (1문장 예고) */
  predictedNextMove: string;
  /**
   * 사용자가 상대에게 그대로 소리 내어 되물을 검증 질문.
   * 진짜 기관·가족이면 쉽게 답하지만 사칭범은 답하지 못하는 질문들이다.
   */
  counterQuestions: string[];
  /** 왜 이 점수인지에 대한 규칙 기반 분해 */
  scoreBreakdown?: ScoreBreakdown;
  engine: "claude" | "fallback";
}

/** 실시간 분석 API 요청 본문 */
export interface LiveAnalyzeRequest {
  /** 지금까지 누적된 전체 트랜스크립트 */
  transcript: string;
  /** 직전 분석 이후 새로 들어온 부분 */
  recentText: string;
  previousLevel: RiskLevel | null;
  previousScore: number | null;
  /** 이미 감지된 신호 키워드 (중복 보고 방지용) */
  knownKeywords: string[];
  /** 직전에 판정된 시나리오 단계 (뒤로 되돌아가지 않게 하는 기준) */
  previousStage: ScamStage | null;
  /**
   * 마이크에서 잰 비언어 신호 설명 (말 빠르기, 쉼 없음, 음량 상승 등).
   * 텍스트만으로는 잡히지 않는 압박 패턴을 보조 근거로 넘긴다.
   */
  nonverbal?: string[];
  callerNumber?: string;
}

/** 실시간 세션 종료 후 요약 */
export interface LiveSessionSummary {
  startedAt: string;
  durationMs: number;
  segments: TranscriptSegment[];
  updates: { at: number; riskScore: number; riskLevel: RiskLevel }[];
  signals: DetectedSignal[];
  finalScore: number;
  finalLevel: RiskLevel;
  /** 입력 소스: 마이크 실시간 / 데모 대본 재생 */
  source: "mic" | "demo";
}
