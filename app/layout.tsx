import type { Metadata } from "next";
import { Noto_Sans_JP, JetBrains_Mono } from "next/font/google";
import { COMPANY_NAME } from "@/lib/demo/company";
import { loadPipelineView } from "@/lib/views/pipeline";
import { deriveOpenTasks } from "@/lib/pipeline/open-tasks";
import { AppShell } from "./components/app-shell";
import "./globals.css";
import "./styles/viz.css";
import "./styles/screens/home.css";
import "./styles/screens/portfolio.css";
import "./styles/screens/valuation.css";
import "./styles/screens/decision.css";
import "./styles/screens/records.css";

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
  const hrefs = new Set(deriveOpenTasks(result).map((task) => task.section));
  return Array.from(hrefs);
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const needsAttentionHrefs = await getNeedsAttentionHrefs();

  return (
    <html lang="ja" className={`${notoSansJP.variable} ${jetbrainsMono.variable}`}>
      <body>
        <AppShell companyName={COMPANY_NAME} needsAttentionHrefs={needsAttentionHrefs}>
          {children}
        </AppShell>
      </body>
    </html>
  );
}
