This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## セットアップ(DBが必要です)

```bash
cp .env.example .env   # 初回のみ。PRISM_API_KEY に任意の値を入れる
npm install
npm run db:up          # Postgres をDockerで起動(ホスト側ポート5433)
npm run db:migrate     # スキーマと権限設定を適用
npm run dev            # 最初の計算結果は初回アクセス時に自動生成される
```

テスト:

```bash
npm test               # DB不要(298件)
npm run test:db        # 要DB。追記のみの権限と永続化の検証(15件)
```

## デプロイ(Vercel)

このアプリは全画面がPostgresを読み書きするため、**DBを用意して環境変数を設定しないと起動しても500になる**(`Application error: a server-side exception has occurred`)。

1. マネージドPostgres(Neon / Supabase / Vercel Postgres など)を用意する。
2. スキーマを適用する。手元から本番DBに向けて実行する:

   ```bash
   DATABASE_URL_MIGRATOR='postgres://...@host/db?sslmode=require' \
     node --experimental-strip-types lib/db/migrate.ts
   ```

   マネージド環境では `prism_app` ロールを作れないことがある。その場合は権限設定
   (append-only の担保)がスキップされ、アプリはオーナーロールで接続する。
3. Vercel の Project Settings > Environment Variables に設定する:

   | 変数 | 値 |
   | --- | --- |
   | `DATABASE_URL` | 本番DBの接続文字列(接続プーラーのエンドポイント推奨) |
   | `PRISM_DEFAULT_TENANT_ID` | 例 `demo-tenant`。**未設定だと500になる** |
   | `PRISM_API_KEY` | `/api/pipeline-result` 用のキー |
   | `BASIC_AUTH_USER` / `BASIC_AUTH_PASSWORD` | Basic認証。下記参照 |
   | `ANTHROPIC_API_KEY` | PDF読み取りを使う場合のみ |

   `sslmode` を書かない接続文字列でもTLSで接続する(`lib/db/client.ts`)。

## Basic認証

`BASIC_AUTH_USER` と `BASIC_AUTH_PASSWORD` の**両方**を設定すると、`proxy.ts` が
全ページ・全APIに Basic認証を要求する(トップページを含む。静的アセットは除く)。
どちらかが未設定なら認証は無効なので、ローカル開発は今までどおり動く。

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
