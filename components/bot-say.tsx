"use client";

import { useEffect, useState } from "react";
import { BotCharacter } from "./bot-character";

/**
 * 캐릭터가 여러 문장을 순서대로 말하는 블록.
 *
 * 한 번에 다 띄우지 않는 이유는 속도가 아니라 태도다. 겁먹은 사람에게 문단을 던지면
 * 읽히지 않는다. 한 줄씩 천천히 도착하는 것 자체가 "급하지 않다"는 신호가 된다.
 * 이미 말한 줄은 남겨 둬서 놓쳤을 때 다시 읽을 수 있게 한다.
 */

/** 한 글자당 타이핑 간격 */
const TYPE_MS = 45;
/** 한 줄을 다 말한 뒤 다음 줄로 넘어가기까지의 쉼 */
const LINE_PAUSE_MS = 900;

export function BotSay({
  lines,
  alert = false,
  size = 96,
}: {
  lines: string[];
  alert?: boolean;
  size?: number;
}) {
  const [lineIndex, setLineIndex] = useState(0);
  const [charIndex, setCharIndex] = useState(0);

  const current = lines[Math.min(lineIndex, Math.max(lines.length - 1, 0))] ?? "";
  const typing = charIndex < current.length;

  // 상태 변경은 전부 타이머 안에서 일어난다 — 효과 본문에서 곧바로 바꾸면 연쇄 렌더가 된다.
  useEffect(() => {
    if (charIndex < current.length) {
      const id = setTimeout(() => setCharIndex((c) => c + 1), TYPE_MS);
      return () => clearTimeout(id);
    }
    if (lineIndex < lines.length - 1) {
      const id = setTimeout(() => {
        setLineIndex((i) => i + 1);
        setCharIndex(0);
      }, LINE_PAUSE_MS);
      return () => clearTimeout(id);
    }
  }, [current, charIndex, lineIndex, lines.length]);

  return (
    <div className="flex flex-col items-center">
      <BotCharacter alert={alert} talking={typing} size={size} />

      <button
        type="button"
        onClick={() => setCharIndex(current.length)}
        className="pb-bubble"
        aria-live="polite"
        title={typing ? "눌러서 끝까지 보기" : undefined}
      >
        <span className="pb-bubble-text">
          {/* 이미 말한 줄 */}
          {lines.slice(0, lineIndex).map((l) => (
            <span key={l} className="mb-1.5 block opacity-70">
              {l}
            </span>
          ))}
          {/* 지금 말하는 줄 */}
          <span className="block">
            {current.slice(0, charIndex)}
            {typing && <span className="pb-caret" aria-hidden />}
          </span>
        </span>
      </button>
    </div>
  );
}
