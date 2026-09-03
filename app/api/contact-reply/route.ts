import { NextResponse } from "next/server";
import { readPending, recordReply } from "@/lib/reply-store";
import type { ContactReply } from "@/lib/types";

export const runtime = "nodejs";

/**
 * 비상연락처 회신 창구.
 *
 * GET  — 통화 중인 당사자 화면이 "답이 왔는지" 물어보는 폴링용.
 * POST — 가족이 회신 페이지에서 버튼을 눌렀을 때.
 *
 * 토큰만 알면 접근할 수 있는 대신, 토큰은 추측 불가능한 난수이고 30분 뒤 사라진다.
 * 응답에는 통화 원문을 담지 않는다 — 요약문까지만 나간다.
 */

const VALID: ContactReply[] = ["safe", "aware"];

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token");
  if (!token) {
    return NextResponse.json({ error: "토큰이 없습니다." }, { status: 400 });
  }

  const item = readPending(token);
  if (!item) {
    // 만료됐거나 서버가 재시작된 경우. 화면은 '회신 없음'으로 자연스럽게 넘어간다.
    return NextResponse.json({ found: false, reply: null });
  }

  return NextResponse.json({
    found: true,
    respondent: item.respondent,
    message: item.message,
    scamType: item.scamType,
    reply: item.reply,
    repliedAt: item.repliedAt,
  });
}

export async function POST(req: Request) {
  let body: { token?: string; reply?: string };
  try {
    body = (await req.json()) as { token?: string; reply?: string };
  } catch {
    return NextResponse.json({ error: "잘못된 요청 형식입니다." }, { status: 400 });
  }

  const { token, reply } = body;
  if (!token || !reply || !VALID.includes(reply as ContactReply)) {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const item = recordReply(token, reply as ContactReply);
  if (!item) {
    return NextResponse.json(
      { error: "요청이 만료되었습니다. 당사자에게 직접 연락해 주세요." },
      { status: 404 },
    );
  }

  return NextResponse.json({ ok: true, reply: item.reply, respondent: item.respondent });
}
