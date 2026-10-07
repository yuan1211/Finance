import { synthesizeResult } from "@/lib/server-voice";
import { isResultVoiceText } from "@/lib/result-voice-request";

export const runtime = "nodejs";
export const maxDuration = 30;
let active = 0;

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return new Response(null, { status: 403 });
  if (!request.headers.get("content-type")?.includes("application/json")) return new Response(null, { status: 415 });
  if (Number(request.headers.get("content-length") || 0) > 4096) return new Response(null, { status: 413 });
  let text: unknown;
  try {
    const body = await request.text();
    if (body.length > 2048) return new Response(null, { status: 413 });
    text = JSON.parse(body).text;
  } catch { return new Response(null, { status: 400 }); }
  if (typeof text !== "string" || text.length > 400 || !isResultVoiceText(text)) return new Response(null, { status: 400 });
  if (active >= 8) return new Response(null, { status: 429, headers: { "Retry-After": "3" } });
  active++;
  try {
    const audio = await synthesizeResult(text);
    return new Response(new Uint8Array(audio), { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "private, no-store" } });
  } catch {
    return Response.json({ error: "음성을 불러오지 못했어요. 다시 눌러 주세요." }, { status: 503 });
  } finally { active--; }
}
