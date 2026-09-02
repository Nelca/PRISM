"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";

const STORAGE_KEY = "prism:home-orientation-dismissed:v1";
type OrientationStoreListener = () => void;

const orientationStoreListeners = new Set<OrientationStoreListener>();
let dismissedForSession = false;

function readOrientationVisible(): boolean {
  if (dismissedForSession) return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== "true";
  } catch {
    return true;
  }
}

function subscribeOrientationStore(listener: OrientationStoreListener): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) listener();
  };

  orientationStoreListeners.add(listener);
  window.addEventListener("storage", onStorage);
  return () => {
    orientationStoreListeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function dismissOrientation() {
  dismissedForSession = true;
  try {
    window.localStorage.setItem(STORAGE_KEY, "true");
  } catch {
    // 保存できない環境でも、このセッション中は閉じた状態を維持する。
  }
  orientationStoreListeners.forEach((listener) => listener());
}

export function HomeOrientation() {
  const visible = useSyncExternalStore(
    subscribeOrientationStore,
    readOrientationVisible,
    () => true
  );

  if (!visible) {
    return <h1 className="sr-only">ダッシュボード</h1>;
  }

  return (
    <section className="home-orientation" aria-labelledby="home-orientation-title">
      <button
        type="button"
        className="home-orientation__dismiss"
        aria-label="PRISMの説明を閉じる"
        title="閉じる"
        onClick={dismissOrientation}
      >
        <span aria-hidden="true">×</span>
      </button>

      <div className="home-orientation__head">
        <div className="home-orientation__intro">
          <p className="home-orientation__eyebrow">PRISMとは</p>
          <h1 id="home-orientation-title" className="home-orientation__title">
            環境データを、投資判断・開示・監査に使える財務情報へ
          </h1>
          <p className="home-orientation__lead">
            取水量・GHG排出量など、すでにある環境データを金額の幅に換算し、投資判断への影響、開示文と根拠、選択理由の記録までを一つの流れで扱います。
          </p>
        </div>
        <Link href="/guide" className="home-orientation__guide">
          PRISMを2分で理解する <span aria-hidden="true">→</span>
        </Link>
      </div>

      <ol className="home-orientation__flow" aria-label="環境データから成果物までの流れ" role="list">
        <li>
          環境データ
          <span className="home-orientation__arrow" aria-hidden="true">→</span>
        </li>
        <li>
          複数手法で金額換算
          <span className="home-orientation__arrow" aria-hidden="true">→</span>
        </li>
        <li>投資判断・開示・監査証跡</li>
      </ol>

      <ul className="home-orientation__benefits" aria-label="PRISMを利用する利点" role="list">
        <li>
          <strong>手元のデータから始められる</strong>
          <span>新しい計測を始めずに着手できる</span>
        </li>
        <li>
          <strong>差の理由を説明できる</strong>
          <span>複数手法の結果差と理由を確認できる</span>
        </li>
        <li>
          <strong>同じ結果を繰り返し使える</strong>
          <span>投資判断、開示、監査対応に再利用できる</span>
        </li>
      </ul>
    </section>
  );
}
