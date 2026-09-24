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
  const [tab, setTab] = useState<"csv" | "single">("single");

  return (
    <>
      <div className="tab-row" role="group" aria-label="登録方法">
        <button
          type="button"
          aria-pressed={tab === "csv"}
          className={`tab-btn${tab === "csv" ? " active" : ""}`}
          onClick={() => setTab("csv")}
        >
          CSVで一括登録
        </button>
        <button
          type="button"
          aria-pressed={tab === "single"}
          className={`tab-btn${tab === "single" ? " active" : ""}`}
          onClick={() => setTab("single")}
        >
          1件ずつ追加
        </button>
      </div>

      <div hidden={tab !== "single"}><AddSiteForm /></div>
      <div hidden={tab !== "csv"}><ImportForm /></div>
    </>
  );
}
