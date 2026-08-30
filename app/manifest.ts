import type { MetadataRoute } from "next";

/**
 * 실제로는 통화 중에 휴대폰에서 쓰는 서비스다.
 * 홈 화면에 설치해 두면 브라우저 주소창 없이 한 번에 열 수 있어,
 * 급한 순간에 화면을 찾는 시간을 줄인다.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "피싱브레이크 — AI 금융 중재자",
    short_name: "피싱브레이크",
    description:
      "보이스피싱이 의심되는 통화를 AI가 실시간으로 들으며 위험을 감지하고, 판단을 잠시 멈춘 뒤 객관적 검증과 심리적 안정을 돕습니다.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#070b14",
    theme_color: "#070b14",
    lang: "ko",
    categories: ["finance", "security", "utilities"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      {
        name: "실시간 통화 감지",
        short_name: "실시간 감지",
        description: "통화를 스피커폰으로 바꾸고 바로 감지를 시작합니다",
        url: "/live",
      },
      {
        name: "상황 입력",
        short_name: "상황 입력",
        description: "통화·문자 내용을 텍스트로 입력해 분석받습니다",
        url: "/check",
      },
    ],
  };
}
