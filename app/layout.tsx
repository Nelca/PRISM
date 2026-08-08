import type { Metadata } from "next";
import { Shippori_Mincho, Noto_Sans_JP, JetBrains_Mono } from "next/font/google";
import { COMPANY_NAME } from "@/lib/demo/company";
import { Nav } from "./components/nav";
import "./globals.css";

const shipporiMincho = Shippori_Mincho({
  variable: "--font-shippori-mincho",
  weight: ["500", "600", "800"],
  subsets: ["latin"],
});

const notoSansJP = Noto_Sans_JP({
  variable: "--font-noto-sans-jp",
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  weight: ["400", "500", "600"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PRISM — 自然資本情報レイヤー",
  description: "自然関連情報の財務判断変換レイヤー",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja" className={`${shipporiMincho.variable} ${notoSansJP.variable} ${jetbrainsMono.variable}`}>
      <body>
        <div className="app">
          <div className="brand">
            <div className="brand__mark">
              <svg viewBox="0 0 24 24" fill="none">
                <path d="M12 1.5L22.5 12L12 22.5L1.5 12L12 1.5Z" stroke="#7FA694" strokeWidth="1.4" />
                <path
                  d="M12 1.5V22.5M1.5 12H22.5M4.9 4.9L19.1 19.1M19.1 4.9L4.9 19.1"
                  stroke="#3E5A50"
                  strokeWidth="0.7"
                />
              </svg>
            </div>
            <div>
              <div className="brand__name">PRISM</div>
              <div className="brand__tag">Natural Capital Decision Layer</div>
            </div>
          </div>

          <div className="topbar">
            <div className="topbar__left">
              <div className="crumbs">
                <b>{COMPANY_NAME}</b>
              </div>
            </div>
            <div className="topbar__right">
              <span className="env-badge">PILOT ENV — FY2027</span>
              <div className="user-chip">
                <div className="user-chip__avatar">宮</div>
                <span>宮里 様(サステナビリティ推進室)</span>
              </div>
            </div>
          </div>

          <Nav />

          <div className="main">{children}</div>
        </div>
      </body>
    </html>
  );
}
