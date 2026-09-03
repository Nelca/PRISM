"use client";

import { useSyncExternalStore } from "react";
import { Card } from "../components/ui";

const STORAGE_KEY = "prism:sites-intake-reference-dismissed:v1";
const listeners = new Set<() => void>();
let dismissedForSession = false;

const FILES = [
  {
    template: "sites",
    file: "sites.csv",
    title: "拠点一覧",
    content: "拠点名・種別・業種・所在地",
  },
  {
    template: "nature-interfaces",
    file: "nature-interfaces.csv",
    title: "自然との接点",
    content: "外部データベースの照会結果",
  },
  {
    template: "engagement-config",
    file: "engagement-config.json",
    title: "評価・判断の設定",
    content: "詳細評価の対象・投資判断の前提",
  },
] as const;

function isVisible() {
  if (dismissedForSession) return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== "true";
  } catch {
    return true;
  }
}

function subscribe(listener: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) listener();
  };
  listeners.add(listener);
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function setVisible(visible: boolean) {
  dismissedForSession = !visible;
  try {
    if (visible) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, "true");
  } catch {
    // 保存領域を利用できない場合も、現在のセッションでは切り替えられる。
  }
  listeners.forEach((listener) => listener());
}

export function IntakeReference() {
  const visible = useSyncExternalStore(subscribe, isVisible, () => true);

  if (!visible) {
    return (
      <div className="site-reference-restore">
        <button type="button" className="pill-btn pill-btn--sm" onClick={() => setVisible(true)}>
          入力ファイルの参考情報を再表示
        </button>
      </div>
    );
  }

  return (
    <Card
      title="入力ファイル（参考）"
      subtitle="必要な場合だけ参照してください"
      padBody={false}
      headExtra={
        <button
          type="button"
          className="reference-dismiss"
          aria-label="入力ファイルの参考情報を閉じる"
          title="閉じる"
          onClick={() => setVisible(false)}
        >
          <span aria-hidden="true">×</span>
        </button>
      }
    >
      <table className="data-table">
        <thead>
          <tr>
            <th>ファイル</th>
            <th>内容</th>
            <th>記入例</th>
          </tr>
        </thead>
        <tbody>
          {FILES.map((entry) => (
            <tr key={entry.template}>
              <td><b>{entry.title}</b></td>
              <td>{entry.content}</td>
              <td>
                <a
                  href={`/api/intake-template?name=${entry.template}`}
                  className="pill-btn pill-btn--sm"
                  download={entry.file}
                >
                  ダウンロード
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
