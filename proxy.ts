import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";

/**
 * テナントの識別はサブドメイン単位(GAP-15)。ログイン機構は意図的に持たない
 * (検証・テストのしやすさを優先する判断。docs/requirements/mvp-completion-gap.md GAP-15参照)。
 * ローカル開発では `PRISM_BASE_DOMAIN` 未設定時に "localhost" を基準とし、
 * 例えば `acme.localhost:3000` でテナント "acme" として動作確認できる。
 */
const BASE_DOMAIN = (process.env.PRISM_BASE_DOMAIN ?? "localhost").toLowerCase();

function extractSubdomain(host: string): string | null {
  const hostname = host.split(":")[0]?.toLowerCase() ?? "";
  if (!hostname || hostname === BASE_DOMAIN) {
    return null;
  }
  if (!hostname.endsWith(`.${BASE_DOMAIN}`)) {
    return null;
  }
  const subdomain = hostname.slice(0, hostname.length - BASE_DOMAIN.length - 1);
  return subdomain === "www" || subdomain === "" ? null : subdomain;
}

/**
 * Basic認証。デプロイ先(Vercel)を公開したくないので、URLを知っている人だけが
 * 入れる状態を防ぐための入口の鍵。アプリ内の認可(誰がどのテナントを見られるか)は
 * 扱わない — それは D-111 のとおりこのリポジトリの対象外。
 *
 * `BASIC_AUTH_USER` と `BASIC_AUTH_PASSWORD` の両方が設定されているときだけ有効。
 * 未設定のローカル開発・テストは今までどおり素通りする(誤って開発を止めないため)。
 */
const BASIC_AUTH_USER = process.env.BASIC_AUTH_USER;
const BASIC_AUTH_PASSWORD = process.env.BASIC_AUTH_PASSWORD;

/** 文字列比較の所要時間からパスワードを推測されないようにする。 */
function equals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) {
    return false;
  }
  return timingSafeEqual(left, right);
}

function isAuthorized(request: NextRequest): boolean {
  if (!BASIC_AUTH_USER || !BASIC_AUTH_PASSWORD) {
    return true;
  }
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Basic ")) {
    return false;
  }
  let decoded: string;
  try {
    decoded = Buffer.from(header.slice("Basic ".length), "base64").toString("utf8");
  } catch {
    return false;
  }
  // パスワードに ":" が含まれてもよいように、最初の ":" だけで分割する。
  const separator = decoded.indexOf(":");
  if (separator < 0) {
    return false;
  }
  const user = decoded.slice(0, separator);
  const password = decoded.slice(separator + 1);
  return equals(user, BASIC_AUTH_USER) && equals(password, BASIC_AUTH_PASSWORD);
}

export function proxy(request: NextRequest) {
  if (!isAuthorized(request)) {
    return new NextResponse("Authentication required", {
      status: 401,
      headers: {
        "WWW-Authenticate": 'Basic realm="prism", charset="UTF-8"',
        // 認証前のレスポンスをCDNやブラウザに残さない。
        "Cache-Control": "no-store",
      },
    });
  }

  const host = request.headers.get("host") ?? "";
  const subdomain = extractSubdomain(host);
  // x-tenant-idは外部入力として信用しない。必ずHostから再生成し、ルートドメインでは削除する。
  // Server Actionは直接POSTできるため、これを残すと任意ヘッダーで別テナントを書き換えられる。
  const requestHeaders = new Headers(request.headers);
  if (subdomain) requestHeaders.set("x-tenant-id", subdomain);
  else requestHeaders.delete("x-tenant-id");
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
