import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

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

export function proxy(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  const subdomain = extractSubdomain(host);
  if (!subdomain) {
    return NextResponse.next();
  }
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-tenant-id", subdomain);
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
