import { NextResponse } from "next/server";
import { MODEL, hasApiKey } from "@/lib/anthropic";
import { isMailEnabled } from "@/lib/notify";

export const runtime = "nodejs";

/** UI 배지용 상태 확인 — LLM 연동 여부, 실제 메일 발송 가능 여부 */
export async function GET() {
  return NextResponse.json({ llmEnabled: hasApiKey(), mailEnabled: isMailEnabled(), model: MODEL });
}
