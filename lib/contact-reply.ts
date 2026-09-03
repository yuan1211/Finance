import type { ContactReply, ScamType, VerifyStatus } from "./types";

/**
 * 3차 검증의 마지막 조각 — 비상연락처가 실제로 뭐라고 답했는가.
 *
 * 요약문을 보낸 것만으로는 검증이 끝나지 않는다. 상대가 뭐라고 답했는지가 들어와야
 * 비로소 "교차 검증"이 된다. 특히 가족 사칭이라면 "저 무사한데요"라는 한마디가
 * 신고 이력이나 대표번호 대조보다 훨씬 결정적인 반증이다.
 *
 * 그래서 응답은 사용자에게 묻지 않고 서비스가 직접 받아 온다. 발송한 메일에 회신 버튼을
 * 넣고, 가족이 누르면 화면에 자동으로 도착한다. 혼란에 빠진 사용자가 조작할 것은 없다.
 * 다만 지어내지는 않는다 — 회신이 없으면 없다고 말한다.
 */

/**
 * 부를 이름을 만든다.
 * 이름이 있으면 '김영희님', 없으면 '가족분'. 없는 이름에 님을 붙이면 '가족님'이 되어 어색하다.
 */
export function respondentLabel(respondent: string): string {
  const n = respondent.trim();
  return n ? `${n}님` : "가족분";
}

/* ------------------------------------------------------------------ *
 * 가족이 회신 페이지에서 고르는 선택지
 * ------------------------------------------------------------------ */

export interface FamilyReplyOption {
  value: Extract<ContactReply, "safe" | "aware">;
  label: string;
  hint: string;
}

/** 회신 링크를 눌러 답하는 사람은 가족이다. 그 사람의 입장에서 쓴 문장이어야 한다. */
export const FAMILY_REPLY_OPTIONS: FamilyReplyOption[] = [
  {
    value: "safe",
    label: "저는 무사합니다",
    hint: "그런 부탁이나 요청을 한 적이 없습니다",
  },
  {
    value: "aware",
    label: "제가 연락한 것이 맞습니다",
    hint: "이 상황을 알고 있습니다",
  },
];

/* ------------------------------------------------------------------ *
 * 응답이 도착했을 때 캐릭터가 건네는 말
 * ------------------------------------------------------------------ */

/**
 * 사용자는 지금 통화 중이고 겁을 먹은 상태다.
 * 두 줄로 끝낸다 — 누가 뭐라고 답했는지, 그래서 뭘 하면 되는지.
 */
export function buildArrivalScript(
  reply: ContactReply,
  scamType: ScamType,
  respondent: string,
): string[] {
  const who = respondentLabel(respondent);

  if (reply === "safe") {
    if (scamType === "가족·지인 사칭") {
      return [`${who}은 무사하다고 답했어요.`, "지금 통화 상대는 그 사람이 아닙니다. 끊으세요."];
    }
    return [`${who}이 그런 요청 없었다고 답했어요.`, "이제 혼자 판단하지 않으셔도 됩니다."];
  }

  if (reply === "aware") {
    return [`${who}이 본인 맞다고 답했어요.`, "그래도 원래 알던 번호로 직접 걸어 확인해 주세요."];
  }

  return [`${who}에게서 아직 답이 없어요.`, "답이 올 때까지 돈을 보내지 마세요."];
}

/* ------------------------------------------------------------------ *
 * 단계 결론
 * ------------------------------------------------------------------ */

export interface ReplyVerdict {
  status: VerifyStatus;
  headline: string;
  details: string[];
  /**
   * 이 응답만으로 사기가 사실상 확정되는가.
   * 가족 사칭에서 본인이 무사하다고 답한 경우가 여기 해당한다.
   */
  decisive: boolean;
}

export function judgeContactReply(
  reply: ContactReply,
  scamType: ScamType,
  respondent: string,
): ReplyVerdict {
  const who = respondentLabel(respondent);

  if (reply === "safe") {
    // 가족 사칭이라면 통화 상대가 그 사람이 아니라는 것이 직접 증명된다.
    if (scamType === "가족·지인 사칭") {
      return {
        status: "danger",
        decisive: true,
        headline: `${who}이 무사하다고 회신했습니다. 지금 통화 중인 상대는 ${who}이 아닙니다.`,
        details: [
          "가족을 사칭한 보이스피싱으로 확인되었습니다. 더 확인할 것이 없습니다.",
          "지금 통화를 끊으세요. 상대가 다시 걸어와도 받지 마세요. 번호를 바꿔 다시 시도하는 경우가 많습니다.",
          "이미 송금하셨다면 즉시 112와 거래 은행에 지급정지를 요청하세요. 빠를수록 회수 가능성이 높습니다.",
        ],
      };
    }

    // 그 밖의 유형에서는 직접 반증까지는 아니지만, 고립이 깨졌다는 것 자체가 큰 진전이다.
    return {
      status: "clear",
      decisive: false,
      headline: `${who}이 그런 요청을 한 적이 없다고 회신했습니다.`,
      details: [
        "혼자 판단하는 상태에서 벗어났습니다. 보이스피싱이 가장 먼저 노리는 것이 이 고립입니다.",
        `${who}과 함께 기관 대표번호로 직접 걸어 한 번 더 확인하세요.`,
        "확인이 끝나기 전에는 어떤 송금도 하지 마세요.",
      ],
    };
  }

  if (reply === "aware") {
    return {
      status: "warning",
      decisive: false,
      headline: `${who}이 본인 연락이 맞다고 회신했지만, 아직 안심하기는 이릅니다.`,
      details: [
        `통화를 끊고 ${who}에게 직접 전화를 걸어 목소리를 확인하세요. 지금 오는 연락 말고, 원래 알고 있던 번호로 거세요.`,
        "사칭범이 가족 번호까지 파악해 미리 연락을 넣어 두는 사례가 있습니다.",
        "본인 목소리를 직접 확인하기 전에는 송금하지 마세요.",
      ],
    };
  }

  return {
    status: "warning",
    decisive: false,
    headline: `${who}에게서 아직 회신이 오지 않았습니다. 확인될 때까지 기다려 주세요.`,
    details: [
      "회신이 올 때까지는 어떤 송금도 하지 마세요.",
      "상대가 '지금 당장'을 강조한다면 그것 자체가 위험 신호입니다. 진짜 기관과 가족은 기다려 줍니다.",
      "다른 가족에게 먼저 물어보거나, 112·1332에 상황만 설명해도 됩니다.",
    ],
  };
}

/** 사후 리포트에 한 줄로 넣을 요약 */
export function describeContactReply(reply: ContactReply, respondent: string): string {
  const who = respondentLabel(respondent);
  if (reply === "safe") return `비상연락처 ${who}: 본인은 무사하며 그런 요청을 한 적이 없다고 회신`;
  if (reply === "aware") return `비상연락처 ${who}: 본인이 연락한 것이 맞다고 회신`;
  return `비상연락처 ${who}: 회신 없음`;
}
