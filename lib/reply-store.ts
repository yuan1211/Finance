import type { ContactReply, ScamType } from "./types";

/**
 * 비상연락처 회신 대기함 (서버 전용).
 *
 * 가족에게 보낸 메일에는 "저는 무사합니다 / 그런 적 없습니다" 버튼이 들어간다.
 * 그 버튼이 눌릴 때까지 무엇을 기다리는지 서버가 알고 있어야 하므로, 발송 시점에
 * 토큰 하나를 만들어 여기 담아 두고 회신이 오면 채운다.
 *
 * 한계(의도적):
 * 이 프로젝트는 DB를 쓰지 않으므로 메모리에만 둔다. 서버 인스턴스가 여럿이거나
 * 콜드 스타트가 끼면 대기 항목이 사라질 수 있다. 그 경우 화면은 '응답 없음'으로
 * 자연스럽게 넘어가며, 사용자에게 잘못된 안심을 주지는 않는다.
 * 실서비스라면 여기만 KV/Redis로 바꾸면 된다.
 */

export interface PendingReply {
  token: string;
  /** 회신할 사람 이름 */
  respondent: string;
  /** 사용자에게 보여 줄 상황 요약문 */
  message: string;
  scamType: ScamType;
  createdAt: number;
  reply: ContactReply | null;
  repliedAt: number | null;
}

/** 30분이 지난 대기 항목은 버린다 */
const TTL_MS = 30 * 60 * 1000;

const store = new Map<string, PendingReply>();

function sweep() {
  const now = Date.now();
  for (const [token, item] of store) {
    if (now - item.createdAt > TTL_MS) store.delete(token);
  }
}

function makeToken(): string {
  // 링크로 나가는 값이라 추측 가능하면 안 된다
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function createPending(opts: {
  respondent: string;
  message: string;
  scamType: ScamType;
}): PendingReply {
  sweep();
  const item: PendingReply = {
    token: makeToken(),
    respondent: opts.respondent,
    message: opts.message,
    scamType: opts.scamType,
    createdAt: Date.now(),
    reply: null,
    repliedAt: null,
  };
  store.set(item.token, item);
  return item;
}

export function readPending(token: string): PendingReply | null {
  sweep();
  return store.get(token) ?? null;
}

/** 회신 기록. 이미 답한 건은 덮어쓰지 않는다 (가족이 링크를 두 번 눌러도 첫 답이 유지된다) */
export function recordReply(token: string, reply: ContactReply): PendingReply | null {
  const item = store.get(token);
  if (!item) return null;
  if (item.reply === null) {
    item.reply = reply;
    item.repliedAt = Date.now();
  }
  return item;
}
