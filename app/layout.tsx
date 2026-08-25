import type { Metadata } from "next";
import Link from "next/link";
import { Shippori_Mincho, Noto_Sans_JP, JetBrains_Mono } from "next/font/google";
import { COMPANY_NAME } from "@/lib/demo/company";
import { loadPipelineView } from "@/lib/views/pipeline";
import { deriveOpenTasks } from "@/lib/pipeline/open-tasks";
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

/**
 * 全ページがDBの最新runを読むため、リクエスト時レンダリングに固定する。
 *
 * 既定(auto)のままだとビルド時にプリレンダリングされ、**その時点のDBの内容がビルド成果物に
 * 焼き込まれる**(DBのない環境ではビルド自体が落ちる)。revalidatePathによる無効化と
 * 組み合わせれば結果は正しくなるが、「画面は常に保存済みの最新runを読む」という設計
 * (計画B-2)を素直に表すため、ここで明示する。
 * 参照: node_modules/next/dist/docs/01-app/02-guides/caching-without-cache-components.md
 */
export const dynamic = "force-dynamic";

/**
 * ナビの状態表示(指示01-4)に使う「要対応のhref集合」。
 *
 * `getOrCreateLatestResult` は React.cache でメモ化してあるため、ここで呼んでも
 * 各page.tsx側の呼び出しと合わせて同一リクエスト内では1回しかDBを読みに行かない。
 * ホーム(/)と記録(/ledger)はタスクの遷移先ではないため、念のため除外する
 * (deriveOpenTasksが返すhrefは現状どちらも含まないが、将来の追加に備えた防御)。
 */
async function getNeedsAttentionHrefs(): Promise<string[]> {
  const result = await loadPipelineView();
  const hrefs = new Set(deriveOpenTasks(result).map((task) => task.href));
  hrefs.delete("/");
  hrefs.delete("/ledger");
  return Array.from(hrefs);
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const needsAttentionHrefs = await getNeedsAttentionHrefs();

  return (
    <html lang="ja" className={`${shipporiMincho.variable} ${notoSansJP.variable} ${jetbrainsMono.variable}`}>
      <body>
        <div className="app">
          {/*
            指示12:デモ注記はページ末尾のfooter-noteで毎画面繰り返すと景色化して読まれなくなるため、
            レイアウト共通の細いバナー1本に集約する(各page.tsxのfooter-noteは削除済み)。
          */}
          <div className="demo-banner">デモデータ(架空企業)を表示中 — 実在の企業・実データではありません</div>

          {/* 2026-08-23レビュー:ロゴのクリックでホームに戻れるようにする(一般的な期待動作)。 */}
          <Link href="/" className="brand" aria-label="ホームへ戻る">
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
              <div className="brand__tag">自然資本の意思決定レイヤー</div>
            </div>
          </Link>

          <div className="topbar">
            <div className="topbar__left">
              <div className="crumbs">
                <b>{COMPANY_NAME}</b>
              </div>
            </div>
            <div className="topbar__right">
              <span className="env-badge">パイロット環境・FY2027</span>
              <div className="user-chip">
                <div className="user-chip__avatar">宮</div>
                <span>宮里 様(サステナビリティ推進室)</span>
              </div>
            </div>
          </div>

          <Nav needsAttentionHrefs={needsAttentionHrefs} />

          <div className="main">{children}</div>
        </div>
      </body>
    </html>
  );
}
