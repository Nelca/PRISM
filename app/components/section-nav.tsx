import Link from "next/link";

export interface SectionNavItem {
  href: string;
  label: string;
  description: string;
  active: boolean;
}

/**
 * 同じ業務内にある親・子画面の現在地と移動先を、常に同じ位置・同じ表現で示す。
 * 親画面のメニューカードと子画面の「戻る」リンクを別々に持たず、1つの導線に統合する。
 */
export function SectionNav({ label, items }: { label: string; items: SectionNavItem[] }) {
  return (
    <nav className="section-nav" aria-label={label}>
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={`section-nav__link${item.active ? " section-nav__link--active" : ""}`}
          aria-current={item.active ? "page" : undefined}
        >
          <b>{item.label}</b>
          <span>{item.description}</span>
        </Link>
      ))}
    </nav>
  );
}
