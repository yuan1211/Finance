/** Only the app's safety-result templates may reach the voice provider. */
export function isResultVoiceText(text: string): boolean {
  const name = "[\\p{L}\\p{M} ·'-]{1,32}";
  if (new RegExp(`^${name}님의 안전 확인 답이 도착했어요\\.$`, "u").test(text)) return true;
  const reply = text.match(new RegExp(`^${name}님께서 (오전|오후) ([1-9]|1[0-2])시 ([0-9]|[1-5][0-9])분에(,)? (.+)$`, "u"));
  if (!reply) return false;
  const body = reply[5];
  if (!reply[4] && body === "본인이 안전하다고 응답했어요. 저는 괜찮아요. 돈을 부탁하지 않았어요.") return true;
  if (reply[4] && body === "“지금 집에서 함께 있어요. 앞서 전달된 장소와 달라요.”라고 응답했어요.") return true;
  const safe = body.match(new RegExp(`^(${name}님)이 안전하다고 응답했어요\\. (${name}님)과 지금 함께 있어요\\. 직접 확인했어요\\.$`, "u"));
  return !reply[4] && !!safe && safe[1].replace(/(?:님)+$/, "") === safe[2].replace(/(?:님)+$/, "");
}
