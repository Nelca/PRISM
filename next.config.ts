import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // PRTR 4ファイルの合計上限45MBにmultipartの境界・ヘッダー分の余裕を加える。
      // 各Server Actionでも用途別の個別上限（PDF 10MB、カテゴリCSV 20MB）を検証する。
      bodySizeLimit: "50.1mb",
    },
  },
  /**
   * 画面統合(指示02・03)で消えたルートを、生き残ったルートへ恒久的に転送する。
   *
   * レンダリング前に効かせたいので、Server Componentの `redirect()` ではなく
   * next.config の `redirects` を使う(node_modules/next/dist/docs/01-app/02-guides/redirecting.md)。
   * リクエストのクエリはそのまま転送先に引き継がれるため、`/decomposition?issue=...` の
   * `issue` は `/analysis` 側でそのまま受け取れる。
   */
  async redirects() {
    return [
      { source: "/intake", destination: "/sites/register", permanent: true },
      { source: "/decomposition", destination: "/analysis", permanent: true },
    ];
  },
};

export default nextConfig;
