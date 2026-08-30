import { BASE_PERSONA, FALLBACK_BETAS, MODEL, getClient } from "@/lib/anthropic";
import { helplines } from "@/lib/mock-db";
import type { ChatMessage, RiskAnalysis, SituationInput, VerifyStepResult } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

interface ChatRequest {
  input: SituationInput | null;
  analysis: RiskAnalysis | null;
  verification: VerifyStepResult[];
  messages: ChatMessage[];
}

function buildSystem(body: ChatRequest): string {
  const a = body.analysis;
  const verifyText =
    body.verification?.length > 0
      ? body.verification.map((s) => `- ${s.title}: [${s.status}] ${s.headline}`).join("\n")
      : "- 아직 역검증을 진행하지 않았습니다.";

  return `${BASE_PERSONA}

[이번 작업]
사용자와 1:1 대화로 심리적 안정과 판단 보조를 제공합니다.

[대화 규칙]
- 한 번에 3~5문장 이내로 답합니다. 길게 설명하지 마세요.
- 사용자의 불안을 먼저 인정한 뒤 사실을 전달합니다.
- 사용자가 "이미 송금했다"고 하면 자책을 멈추게 하고, 즉시 112 신고와 지급정지 절차를 순서대로 안내합니다.
- 사용자가 계속 불안해하면 지금 당장 할 수 있는 아주 작은 행동 하나만 제안합니다.
- 필요할 때 아래 공식 번호를 안내합니다: ${helplines.map((h) => `${h.name} ${h.number}`).join(", ")}.
- 사용자가 검증 결과에 없는 사실을 물으면 "지금 확인된 범위에서는 알 수 없다"고 솔직히 말합니다.

[현재 케이스 정보]
- 채널: ${body.input?.channel ?? "미입력"}
- 상대 주장 소속: ${body.input?.claimedOrg?.trim() || "없음"}
- 발신번호: ${body.input?.callerNumber?.trim() || "없음"}
- AI 위험도: ${a ? `${a.riskLevel} (${a.riskScore}점) / 의심 유형: ${a.scamType}` : "미판정"}
- 판단 근거: ${a?.reasoning ?? "없음"}
- 확인된 위험 신호: ${a?.detectedSignals?.map((s) => s.keyword).join(", ") || "없음"}

[역검증 결과]
${verifyText}

[통화·문자 원문]
"""
${body.input?.content?.trim().slice(0, 3000) ?? "없음"}
"""`;
}

function offlineReply(body: ChatRequest): string {
  const level = body.analysis?.riskLevel ?? "중간";
  const base =
    level === "높음"
      ? "지금 느끼시는 불안, 충분히 이해합니다. 확인된 위험 신호가 뚜렷하니 지금은 아무것도 이체하지 마세요."
      : "혼자 판단하지 않으셔도 됩니다. 확인이 필요한 부분을 같이 정리해 볼게요.";
  return `${base}
통화는 끊으셔도 괜찮습니다. 정상 기관이라면 다시 연락이 옵니다.
기관 공식 대표번호로 직접 걸어 확인하시고, 가까운 가족에게도 상황을 알려 주세요.
필요하시면 112(경찰) 또는 1332(금융감독원)로 바로 상담하실 수 있습니다.

(현재 서버에 ANTHROPIC_API_KEY가 설정되지 않아 기본 안내문으로 응답했습니다.)`;
}

export async function POST(req: Request) {
  let body: ChatRequest;
  try {
    body = (await req.json()) as ChatRequest;
  } catch {
    return new Response("잘못된 요청 형식입니다.", { status: 400 });
  }

  const history = (body.messages ?? []).filter((m) => m.content?.trim()).slice(-20);
  if (history.length === 0 || history[history.length - 1].role !== "user") {
    return new Response("마지막 메시지는 사용자 메시지여야 합니다.", { status: 400 });
  }

  const client = getClient();
  const encoder = new TextEncoder();

  if (!client) {
    return new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(offlineReply(body)));
          controller.close();
        },
      }),
      { headers: { "Content-Type": "text/plain; charset=utf-8" } },
    );
  }

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const s = client.beta.messages.stream({
          model: MODEL,
          max_tokens: 8000,
          betas: [...FALLBACK_BETAS],
          fallbacks: "default",
          system: [{ type: "text", text: buildSystem(body), cache_control: { type: "ephemeral" } }],
          output_config: { effort: "low" },
          messages: history.map((m) => ({ role: m.role, content: m.content })),
        });

        for await (const event of s) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }

        const final = await s.finalMessage();
        if (final.stop_reason === "refusal") {
          controller.enqueue(
            encoder.encode(
              "\n\n죄송합니다. 이 요청은 지금 답변드리기 어렵습니다. 112 또는 1332로 직접 상담해 주세요.",
            ),
          );
        }
      } catch (err) {
        console.error("[chat] 스트리밍 실패:", err);
        controller.enqueue(encoder.encode(offlineReply(body)));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
