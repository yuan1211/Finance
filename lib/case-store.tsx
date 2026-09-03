"use client";

import { useMemo, useSyncExternalStore } from "react";
import type {
  CaseState,
  ChatMessage,
  ContactReplyRecord,
  EmergencyContact,
  FollowUpReport,
  RiskAnalysis,
  SituationInput,
  VerifyStepResult,
} from "./types";

const CASE_KEY = "pb:case";
const CONTACT_KEY = "pb:contacts";
const LARGE_KEY = "pb:largeText";

/**
 * 케이스(통화/문자 원문 포함)는 sessionStorage에만 저장한다.
 * → 탭을 닫으면 사라지고, 서버 DB에는 어떤 형태로도 남지 않는다.
 * 비상연락처만 사용자가 재사용할 수 있도록 localStorage에 둔다.
 *
 * React 상태 대신 모듈 단위 외부 스토어 + useSyncExternalStore를 사용해,
 * 브라우저 저장소라는 외부 시스템과 렌더링을 안전하게 동기화한다.
 */
export function emptyCase(): CaseState {
  return {
    createdAt: "",
    input: null,
    analysis: null,
    verification: [],
    contactReply: null,
    chat: [],
    report: null,
  };
}

interface Snapshot {
  caseState: CaseState;
  contacts: EmergencyContact[];
  /** 큰 글씨 모드 — 고령 사용자를 위한 표시 설정 */
  largeText: boolean;
  hydrated: boolean;
}

const SERVER_SNAPSHOT: Snapshot = {
  caseState: emptyCase(),
  contacts: [],
  largeText: false,
  hydrated: false,
};

let snapshot: Snapshot = SERVER_SNAPSHOT;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function commit(next: Partial<Snapshot>) {
  snapshot = { ...snapshot, ...next };
  emit();
}

function writeCase(next: CaseState) {
  try {
    sessionStorage.setItem(CASE_KEY, JSON.stringify(next));
  } catch {
    // 저장소 접근이 막힌 환경(시크릿 모드 등)에서는 메모리 상태로만 동작한다
  }
  commit({ caseState: next });
}

function writeContacts(next: EmergencyContact[]) {
  try {
    localStorage.setItem(CONTACT_KEY, JSON.stringify(next));
  } catch {
    // 무시
  }
  commit({ contacts: next });
}

/** 큰 글씨 설정은 CSS가 읽을 수 있도록 문서 루트에도 반영한다 */
function applyLargeText(on: boolean) {
  if (typeof document === "undefined") return;
  if (on) document.documentElement.dataset.large = "on";
  else delete document.documentElement.dataset.large;
}

function writeLargeText(next: boolean) {
  try {
    localStorage.setItem(LARGE_KEY, next ? "1" : "0");
  } catch {
    // 무시
  }
  applyLargeText(next);
  commit({ largeText: next });
}

let hydrated = false;

/** 첫 구독 시점(= 클라이언트 커밋 이후)에 한 번만 저장소를 읽어온다 */
function hydrateOnce() {
  if (hydrated) return;
  hydrated = true;

  let caseState = emptyCase();
  let contacts: EmergencyContact[] = [];
  let largeText = false;
  try {
    const rawCase = sessionStorage.getItem(CASE_KEY);
    if (rawCase) caseState = { ...caseState, ...(JSON.parse(rawCase) as Partial<CaseState>) };
    const rawContacts = localStorage.getItem(CONTACT_KEY);
    if (rawContacts) contacts = JSON.parse(rawContacts) as EmergencyContact[];
    largeText = localStorage.getItem(LARGE_KEY) === "1";
  } catch {
    // 손상된 데이터는 무시하고 빈 상태로 시작한다
  }
  applyLargeText(largeText);
  commit({ caseState, contacts, largeText, hydrated: true });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  hydrateOnce();
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return snapshot;
}

function getServerSnapshot() {
  return SERVER_SNAPSHOT;
}

const actions = {
  setInput(input: SituationInput) {
    writeCase({ ...emptyCase(), createdAt: new Date().toISOString(), input });
  },
  setAnalysis(analysis: RiskAnalysis) {
    writeCase({ ...snapshot.caseState, analysis });
  },
  setVerification(verification: VerifyStepResult[]) {
    writeCase({ ...snapshot.caseState, verification });
  },
  /** 3차 검증에서 비상연락처가 실제로 답한 내용. null이면 기록을 지운다. */
  setContactReply(contactReply: ContactReplyRecord | null) {
    writeCase({ ...snapshot.caseState, contactReply });
  },
  setChat(chat: ChatMessage[]) {
    writeCase({ ...snapshot.caseState, chat });
  },
  setReport(report: FollowUpReport) {
    writeCase({ ...snapshot.caseState, report });
  },
  addContact(contact: Omit<EmergencyContact, "id">) {
    writeContacts([
      ...snapshot.contacts,
      { ...contact, id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}` },
    ]);
  },
  removeContact(id: string) {
    writeContacts(snapshot.contacts.filter((c) => c.id !== id));
  },
  setLargeText(on: boolean) {
    writeLargeText(on);
  },
  resetCase() {
    try {
      sessionStorage.removeItem(CASE_KEY);
    } catch {
      // 무시
    }
    commit({ caseState: emptyCase() });
  },
};

export function useCase() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return useMemo(() => ({ ...state, ...actions }), [state]);
}
