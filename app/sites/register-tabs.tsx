"use client";

import { useState } from "react";
import { ImportForm } from "./import-form";
import { AddSiteForm } from "./add-site-form";

/**
 * 登録手段の並置(指示02)。
 *
 * CSV一括と1件ずつの追加は、実装の都合(取込経路の違い)で画面が分かれていたが、
 * 利用者から見ればどちらも「対象を登録する」1つの作業なので、同じ場所にタブで並べる。
 */
export function RegisterTabs() {
  const [tab, setTab] = useState<"csv" | "single">("csv");

  return (
    <>
      <div className="tab-row" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "csv"}
          className={`tab-btn${tab === "csv" ? " active" : ""}`}
          onClick={() => setTab("csv")}
        >
          CSVで一括登録
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "single"}
          className={`tab-btn${tab === "single" ? " active" : ""}`}
          onClick={() => setTab("single")}
        >
          1件ずつ追加
        </button>
      </div>

      {tab === "csv" ? (
        <ImportForm />
      ) : (
        <div>
          <p style={{ margin: "0 0 12px", fontSize: 12.5, color: "var(--ink-soft)" }}>
            拠点を1件だけ足す場合はこちら。CSVを用意しなくても、拠点名・業種・所在地だけで登録できます。
            登録すると周辺環境との関係を確認し、感応度を算定します。
          </p>
          <AddSiteForm />
        </div>
      )}
    </>
  );
}
