import type { Metadata } from "next";
import { Geist, Geist_Mono, IBM_Plex_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/** build-plan §6「数値表示の統一:IBM Plex Monoを数値・台帳表示に使用」。 */
const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  weight: ["400", "500", "600"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PRISM(候補ε)",
  description: "自然関連情報の財務判断変換レイヤー",
};

const NAV_ITEMS = [
  { href: "/", label: "概要" },
  { href: "/sites", label: "M1 拠点" },
  { href: "/assessment", label: "M2 評価" },
  { href: "/valuation", label: "M3/M4 貨幣化・乖離分解" },
  { href: "/decision", label: "M6 意思決定" },
  { href: "/disclosure", label: "M7 開示検証" },
  { href: "/ledger", label: "M8 記録・版管理" },
];

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ja"
      className={`${geistSans.variable} ${geistMono.variable} ${ibmPlexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-zinc-50 text-zinc-900 dark:bg-black dark:text-zinc-100">
        <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
          <div className="mx-auto max-w-6xl px-4 py-3">
            <p className="text-sm font-semibold">PRISM(候補ε) — ダミーデータによる動作確認</p>
            <nav className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
              {NAV_ITEMS.map((item) => (
                <Link key={item.href} href={item.href} className="text-zinc-600 hover:text-zinc-950 hover:underline dark:text-zinc-400 dark:hover:text-zinc-50">
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
