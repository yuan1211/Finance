/**
 * 도우미 캐릭터.
 *
 * 경고 아이콘이 아니라 곁에 있는 존재로 읽혀야 하므로 각을 죽이고 눈을 크게 뒀다.
 * 위험을 알릴 때도 화를 내거나 겁을 주지 않는다 — 눈매만 살짝 걱정스럽게 바뀐다.
 * 말하는 동안에는 입이 움직이고, 멈추면 다문다.
 *
 * 개입 화면(guardian-bot)과 회신 도착 알림(verify) 양쪽에서 같은 얼굴을 쓴다.
 * 사용자가 같은 존재로 인식해야 "아까 그 도우미가 답을 가져왔다"로 읽힌다.
 */
export function BotCharacter({
  alert = false,
  talking = false,
  size = 112,
}: {
  /** 위험을 알리는 상황인지 (색과 눈썹이 바뀐다) */
  alert?: boolean;
  /** 지금 말하고 있는지 (입이 움직인다) */
  talking?: boolean;
  size?: number;
}) {
  return (
    <div
      className={`pb-char ${alert ? "is-alert" : ""} ${talking ? "is-talking" : ""}`}
      aria-hidden
    >
      <svg viewBox="0 0 120 120" width={size} height={size} role="presentation">
        <defs>
          <linearGradient id="pb-head" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1b2b45" />
            <stop offset="100%" stopColor="#111c30" />
          </linearGradient>
        </defs>

        {/* 뒤에서 은은하게 도는 후광 — 존재감만 주고 시선은 뺏지 않는다 */}
        <circle className="pb-char-halo" cx="60" cy="62" r="46" />

        {/* 안테나 */}
        <line
          x1="60"
          y1="16"
          x2="60"
          y2="26"
          className="pb-char-stroke"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <circle className="pb-char-led" cx="60" cy="13" r="4.5" />

        {/* 귀 */}
        <rect x="12" y="55" width="8" height="18" rx="4" className="pb-char-ear" />
        <rect x="100" y="55" width="8" height="18" rx="4" className="pb-char-ear" />

        {/* 머리 */}
        <rect
          x="20"
          y="26"
          width="80"
          height="70"
          rx="26"
          fill="url(#pb-head)"
          className="pb-char-stroke"
          strokeWidth="2"
        />

        {/* 눈 */}
        <g className="pb-char-eyes">
          <circle className="pb-char-eye" cx="45" cy="57" r="6.5" />
          <circle className="pb-char-eye" cx="75" cy="57" r="6.5" />
        </g>

        {/* 걱정스러운 눈썹 — 위험을 알릴 때만 보인다 */}
        <g className="pb-char-brows">
          <line x1="37" y1="44" x2="52" y2="48" strokeWidth="2.5" strokeLinecap="round" />
          <line x1="83" y1="44" x2="68" y2="48" strokeWidth="2.5" strokeLinecap="round" />
        </g>

        {/* 입 */}
        <rect className="pb-char-mouth" x="50" y="74" width="20" height="7" rx="3.5" />
      </svg>
    </div>
  );
}
