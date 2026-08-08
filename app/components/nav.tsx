"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  {
    group: "対象の把握",
    items: [
      { href: "/sites", label: "対象定義とLocate", sub: "拠点・サプライヤーの登録" },
      { href: "/assessment", label: "評価の優先順位", sub: "評価が必要な課題を絞り込む" },
    ],
  },
  {
    group: "価値の算定と判断",
    items: [
      { href: "/valuation", label: "価値の算定", sub: "複数の算定方法を並べて比較" },
      { href: "/decomposition", label: "算定結果の比較", sub: "方法によるちがいを整理する" },
      { href: "/financial-bridge", label: "財務への影響", sub: "利益・リスクへの反映" },
      { href: "/decision", label: "対策の検討", sub: "投資判断への影響を確認" },
    ],
  },
  {
    group: "開示と記録",
    items: [
      { href: "/disclosure", label: "開示内容の確認", sub: "記載内容と根拠の整合" },
      { href: "/ledger", label: "変更履歴", sub: "判断の記録と根拠" },
    ],
  },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <div className="nav">
      {NAV.map((section) => (
        <div key={section.group}>
          <div className="nav__section-label">{section.group}</div>
          {section.items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`nav__item${pathname === item.href ? " active" : ""}`}
            >
              <div className="nav__label">
                {item.label}
                <small>{item.sub}</small>
              </div>
            </Link>
          ))}
        </div>
      ))}
      <div className="nav__divider" />
      <div className="nav__foot">
        トップ:
        <Link href="/" style={{ color: "#B9C2CE" }}>
          概要へ戻る
        </Link>
      </div>
    </div>
  );
}
