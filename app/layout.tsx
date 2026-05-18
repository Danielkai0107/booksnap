import type { Metadata } from "next";
import { DM_Sans, Noto_Sans_TC } from "next/font/google";
import AuthSessionSync from "@/components/AuthSessionSync";
import ScrollToTopOnNavigate from "@/components/ScrollToTopOnNavigate";
import { ToastProvider } from "@/components/ToastProvider";
import "./globals.css";

const dmSans = DM_Sans({
  variable: "--font-dm",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const notoSansTC = Noto_Sans_TC({
  variable: "--font-noto-tc",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "booksnap",
  description: "小型圖書館入庫、歸還與後台管理系統",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-Hant"
      className={`${dmSans.variable} ${notoSansTC.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-white text-neutral-900 font-sans flex flex-col">
        <ToastProvider>
          <AuthSessionSync />
          <ScrollToTopOnNavigate />
          {children}
        </ToastProvider>
      </body>
    </html>
  );
}
