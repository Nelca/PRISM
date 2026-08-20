/**
 * 接続先に応じたTLS設定。アプリ(client.ts)とマイグレーション実行器(migrate.ts)で共有する。
 *
 * マネージドPostgres(Neon等)はTLS必須なのに、接続URLに `sslmode` が無いと
 * node-postgres は平文で繋ごうとして失敗する。ホスト名がローカルでなければTLSを既定にする。
 * URLに `sslmode` が書かれている場合は `undefined` を返してそちらを尊重する
 * (node-postgres が接続文字列から解釈する)。
 *
 * このファイルは `next/headers` などNext固有のAPIに依存しない。
 * `node lib/db/migrate.ts` から素のNodeで読めるようにしておくため。
 */
export function sslOption(url: string): { rejectUnauthorized: boolean } | undefined {
  if (/[?&]sslmode=/.test(url)) {
    return undefined;
  }
  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    return undefined;
  }
  const isLocal =
    hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "db";
  return isLocal ? undefined : { rejectUnauthorized: true };
}
