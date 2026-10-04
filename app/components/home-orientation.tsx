"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { FeatureGrid, FeatureCard } from "./viz";
import { STAGE_ICON } from "./icons";

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

function showOrientation() {
  dismissedForSession = false;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 保存領域を利用できない環境でも、このセッション中は再表示する。
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
    return (
      <div className="home-orientation-restore">
        <h1 className="sr-only">ダッシュボード</h1>
        <button type="button" className="pill-btn pill-btn--sm" onClick={showOrientation}>
          PRISMとはを再表示
        </button>
      </div>
    );
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
          <p className="home-orientation__eyebrow">環境データから、次の意思決定へ</p>
          <h1 id="home-orientation-title" className="home-orientation__title">
            自然への影響を、経営の判断材料に。
          </h1>
          <p className="home-orientation__lead">
            取水量やGHG排出量から、事業への影響を金額で捉える。対策に投資する判断も、開示の説明も、同じ根拠から始められます。
          </p>
        </div>
      </div>

      <div className="welcome-actions">
        <Link href="/valuation" className="pill-btn pill-btn--primary">デモの算定結果を見る <span aria-hidden="true">→</span></Link>
        <Link href="/sites/register" className="welcome-actions__secondary">自分の拠点を登録する <span aria-hidden="true">↗</span></Link>
        <Link href="/guide" className="home-orientation__guide">使い方ガイド</Link>
      </div>
      <p className="welcome-note">まずは登録済みのデモデータで、金額の比較から判断までの流れを確認できます。</p>

      <FeatureGrid>
        <FeatureCard icon={STAGE_ICON.sites} title="手元の環境データを登録" href="/sites" tone="neutral">
          既存の取水量・排出量から始められます
        </FeatureCard>
        <FeatureCard icon={STAGE_ICON.valuation} title="金額の幅と差の理由を確認" href="/valuation" tone="neutral">
          算定方法の違いを、根拠から説明できます
        </FeatureCard>
        <FeatureCard icon={STAGE_ICON.decision} title="投資判断と開示に活用" href="/decision" tone="neutral">
          同じ結果を稟議・開示・監査対応に使えます
        </FeatureCard>
      </FeatureGrid>
    </section>
  );
}
