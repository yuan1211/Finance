import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Footer, Header } from "@/components/shell";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "피싱브레이크 | 혼자 판단하지 않게 하는 AI 금융 중재자",
  description:
    "보이스피싱이 의심되는 통화를 AI가 실시간으로 들으며 위험을 감지하고, 판단을 잠시 멈춘 뒤 객관적 검증과 심리적 안정을 함께 돕습니다.",
  applicationName: "피싱브레이크",
  appleWebApp: {
    capable: true,
    title: "피싱브레이크",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [{ url: "/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#070b14",
  // 통화 중 급하게 조작하는 화면이라 확대는 막지 않는다 (접근성)
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
