import type { EmergencyContact } from "./types";

/**
 * 비상연락처 알림 발송.
 *
 * 보이스피싱의 핵심 수법은 고립이다. "아무에게도 말하지 마세요"라는 요구를 깨는 가장 빠른 방법은
 * 사용자가 아니라 서비스가 대신 가족에게 알리는 것이다.
 *
 * 메일에는 회신 버튼이 함께 나간다. 가족이 그 버튼을 누르면 사용자의 화면에 응답이
 * 자동으로 도착한다 — 통화 중인 사용자가 따로 물어보고 옮겨 적을 필요가 없다.
 *
 * RESEND_API_KEY가 있으면 실제로 이메일을 보내고, 없으면 시뮬레이션으로 처리한다.
 * 해커톤 데모에서는 키 없이도 전체 흐름이 끊기지 않아야 하므로 후자를 기본으로 둔다.
 * 문자(SMS)는 국내 발송에 사업자 등록과 사전 승인이 필요해 MVP 범위에서 제외했다.
 */

const ENDPOINT = "https://api.resend.com/emails";

export function isMailEnabled(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.NOTIFY_FROM_EMAIL);
}

export interface NotifyOutcome {
  /** 실제로 발송된 수신자 */
  sent: string[];
  /** 이메일이 등록되지 않아 보내지 못한 수신자 */
  missingEmail: string[];
  /** 발송을 시도했으나 실패한 수신자 */
  failed: { name: string; reason: string }[];
  /** 실제 발송이 일어났는지 (false면 시뮬레이션) */
  live: boolean;
}

function renderHtml(message: string, replyUrl?: string): string {
  const body = message
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px;line-height:1.7">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("");

  return `<div style="font-family:-apple-system,'Malgun Gothic',sans-serif;max-width:560px;margin:0 auto;padding:28px 24px;color:#16202f">
  <p style="margin:0 0 6px;font-size:12px;letter-spacing:.08em;color:#5a6c88">피싱브레이크 · PISHING BREAK</p>
  <h1 style="margin:0 0 18px;font-size:20px;line-height:1.4">가족분이 보이스피싱 의심 통화를 받고 있습니다</h1>
  <div style="border-left:3px solid #c22f2f;background:#fbf3f3;padding:16px 18px;border-radius:4px;font-size:15px">${body}</div>
  ${replyUrl ? renderReplyBlock(replyUrl) : ""}
  <p style="margin:20px 0 0;font-size:13px;line-height:1.7;color:#5a6c88">
    지금 당사자에게 직접 연락해 통화를 끊도록 도와주세요.
    실제 피해가 발생했다면 즉시 <strong>112(경찰)</strong> 또는 <strong>1332(금융감독원)</strong>로 신고하시기 바랍니다.
  </p>
  <p style="margin:16px 0 0;font-size:11px;color:#8a97ab">
    이 메일은 당사자가 피싱브레이크에 직접 등록한 비상연락처로 발송되었습니다.
    본 서비스는 2026 금융 AI Challenge 출품작으로, 화면에 표시되는 신고 이력·계좌·전화번호는 가상의 샘플 데이터입니다.
  </p>
</div>`;
}

/**
 * 회신 버튼.
 *
 * 가족이 이걸 누르는 순간 통화 중인 당사자 화면에 "○○님이 무사하다고 답했어요"가 뜬다.
 * 전화를 걸어 설명할 겨를이 없는 상황이 대부분이라, 한 번의 탭으로 끝나야 한다.
 */
function renderReplyBlock(replyUrl: string): string {
  const url = escapeHtml(replyUrl);
  return `<div style="margin:22px 0 0;padding:18px;border:1px solid #dfe5ee;border-radius:8px;background:#f7f9fc">
    <p style="margin:0 0 12px;font-size:14px;font-weight:700;color:#16202f">지금 바로 답해 주세요</p>
    <p style="margin:0 0 14px;font-size:13px;line-height:1.7;color:#5a6c88">
      아래 버튼을 누르면 당사자 화면에 답이 즉시 표시됩니다. 통화 중이라 전화를 받기 어려울 수 있습니다.
    </p>
    <a href="${url}" style="display:inline-block;padding:12px 20px;border-radius:8px;background:#1a6fd4;color:#fff;font-size:14px;font-weight:700;text-decoration:none">
      답하러 가기
    </a>
  </div>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function sendEmergencyNotice(
  contacts: EmergencyContact[],
  message: string,
  /** 가족이 눌러서 답할 회신 페이지 주소. 없으면 버튼 없이 안내문만 나간다. */
  replyUrl?: string,
): Promise<NotifyOutcome> {
  const outcome: NotifyOutcome = { sent: [], missingEmail: [], failed: [], live: isMailEnabled() };

  if (!outcome.live) {
    // 키가 없으면 발송을 흉내만 낸다. 화면에는 시뮬레이션임을 그대로 표시한다.
    outcome.sent = contacts.map((c) => c.name);
    return outcome;
  }

  const from = process.env.NOTIFY_FROM_EMAIL as string;

  await Promise.all(
    contacts.map(async (c) => {
      if (!c.email?.trim()) {
        outcome.missingEmail.push(c.name);
        return;
      }
      try {
        const res = await fetch(ENDPOINT, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from,
            to: [c.email.trim()],
            subject: "[피싱브레이크] 가족분이 보이스피싱 의심 통화를 받고 있습니다",
            html: renderHtml(message, replyUrl),
            text: message,
          }),
        });
        if (!res.ok) {
          outcome.failed.push({ name: c.name, reason: `HTTP ${res.status}` });
          return;
        }
        outcome.sent.push(c.name);
      } catch (err) {
        outcome.failed.push({
          name: c.name,
          reason: err instanceof Error ? err.message : "알 수 없는 오류",
        });
      }
    }),
  );

  return outcome;
}
