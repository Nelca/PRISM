import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * 画面統合(指示02・03)で消えたルートを、生き残ったルートへ恒久的に転送する。
   *
   * レンダリング前に効かせたいので、Server Componentの `redirect()` ではなく
   * next.config の `redirects` を使う(node_modules/next/dist/docs/01-app/02-guides/redirecting.md)。
   * リクエストのクエリはそのまま転送先に引き継がれるため、`/decomposition?issue=...` の
   * `issue` は `/valuation` 側でそのまま受け取れる。
   */
  async redirects() {
    return [
      { source: "/intake", destination: "/sites", permanent: true },
      { source: "/decomposition", destination: "/valuation", permanent: true },
    ];
  },
};

export default nextConfig;
