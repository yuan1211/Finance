"use client";

import { useSyncExternalStore } from "react";

/**
 * 데스크톱에서 앱을 휴대폰 화면처럼 보여 주는 껍데기.
 *
 * 이 서비스는 실제로는 통화 중에 폰에서 쓰는 것이지만, 심사와 시연은 대부분 PC 브라우저에서
 * 이뤄진다. 넓은 화면에 폰용 레이아웃이 늘어져 보이면 "무엇을 만든 건지"가 흐려지므로,
 * 큰 화면에서만 390px 폭의 기기 프레임 안에 넣는다.
 *
 * 좁은 화면(실제 휴대폰)에서는 CSS가 프레임을 통째로 무시한다. 폰에서는 달라지는 것이 없다.
 *
 * 표시 설정이라 case-store와 같은 방식(모듈 외부 스토어 + useSyncExternalStore)으로
 * localStorage와 동기화한다.
 */

const STORAGE_KEY = "pb:deviceFrame";

/** 서버 렌더 시점의 기본값. 시연 상황이 기본이라고 보는 편이 맞다. */
const SERVER_SNAPSHOT = true;

let framed: boolean | null = null;
const listeners = new Set<() => void>();

function getSnapshot(): boolean {
  if (framed === null) {
    try {
      framed = window.localStorage.getItem(STORAGE_KEY) !== "off";
    } catch {
      // 시크릿 모드 등에서 저장소가 막혀 있어도 기본값으로 동작한다
      framed = SERVER_SNAPSHOT;
    }
  }
  return framed;
}

function getServerSnapshot(): boolean {
  return SERVER_SNAPSHOT;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function setFramed(next: boolean) {
  framed = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, next ? "on" : "off");
  } catch {
    // 저장에 실패해도 이번 세션에는 적용된다
  }
  for (const l of listeners) l();
}

export function DeviceFrame({ children }: { children: React.ReactNode }) {
  const framedNow = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return (
    <div className="pb-shell" data-framed={framedNow ? "" : undefined}>
      <div className="pb-device">
        <div className="pb-screen">{children}</div>
        <span className="pb-indicator" aria-hidden />
      </div>

      {/* 프레임은 큰 화면에서만 의미가 있어, 토글도 CSS로 거기서만 보이게 한다 */}
      <button type="button" onClick={() => setFramed(!framedNow)} className="pb-frame-toggle">
        {framedNow ? "전체 화면으로 보기" : "휴대폰 화면으로 보기"}
      </button>
    </div>
  );
}
