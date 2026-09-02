"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { INDUSTRY_SECTOR_OPTIONS } from "../components/labels";
import { addSiteAction, updateSiteAction, type AddSiteFormState } from "./actions";
import type { UserSiteEntry } from "@/lib/demo/site-entry";

const initialState: AddSiteFormState = {};

/**
 * 拠点の追加と編集は入力欄が同じなので、1つのモーダルで両方を賄う(指示B-03)。
 * 違うのは「どのServer Actionを呼ぶか」「既存値をプリフィルするか」「見出しと送信ラベル」だけ。
 */
function SiteFormModal({ entry }: { entry?: UserSiteEntry }) {
  const editing = entry !== undefined;
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(editing ? updateSiteAction : addSiteAction, initialState);
  const [locationKind, setLocationKind] = useState<"coordinates" | "address">(
    entry && entry.row.lat === undefined ? "address" : "coordinates"
  );
  const wasPending = useRef(false);
  const pendingRef = useRef(pending);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  // 一覧の行ごとに同じフォームが並ぶため、label/inputの紐付けにはインスタンス固有のidを使う。
  const uid = useId();
  const fieldId = (name: string) => `${uid}-${name}`;

  useEffect(() => {
    pendingRef.current = pending;
    if (wasPending.current && !pending && !state.error) {
      setOpen(false);
    }
    wasPending.current = pending;
  }, [pending, state]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    const trigger = triggerRef.current;
    document.body.style.overflow = "hidden";
    dialogRef.current?.querySelector<HTMLElement>("button, input, select, textarea")?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (pendingRef.current) return;
        setOpen(false);
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [href], [tabindex]:not([tabindex="-1"])'
      ));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      trigger?.focus();
    };
  }, [open]);

  const deepDive = entry?.deepDive;

  return (
    <>
      {editing ? (
        <button ref={triggerRef} type="button" className="pill-btn pill-btn--sm" onClick={() => setOpen(true)}>
          編集
        </button>
      ) : (
        <button ref={triggerRef} type="button" className="pill-btn pill-btn--accent" onClick={() => setOpen(true)}>
          拠点を追加
        </button>
      )}

      {open && (
        <div className="modal-overlay" onClick={(e) => !pending && e.target === e.currentTarget && setOpen(false)}>
          <div ref={dialogRef} className="modal-card" role="dialog" aria-modal="true" aria-labelledby={fieldId("dialog-title")} aria-describedby={fieldId("dialog-description")}>
            <div className="modal-head">
              <div>
                <h3 id={fieldId("dialog-title")}>{editing ? "拠点を編集" : "拠点を追加"}</h3>
                <p id={fieldId("dialog-description")}>
                  {editing
                    ? "保存すると再計算され、変更の内容は記録に残ります"
                    : "登録すると、周辺環境との関係を確認し「自然との関わり」を算定します"}
                </p>
              </div>
              <button type="button" className="modal-close" aria-label="閉じる" disabled={pending} onClick={() => setOpen(false)}>
                ✕
              </button>
            </div>
            <form action={formAction}>
              {editing && <input type="hidden" name="siteId" value={entry.row.id} />}
              <div className="modal-body">
                <div className="field">
                  <label htmlFor={fieldId("name")}>拠点名</label>
                  <input
                    id={fieldId("name")}
                    name="name"
                    placeholder="例:名古屋第二工場"
                    defaultValue={entry?.row.name ?? ""}
                    required
                  />
                </div>
                <div className="field-row">
                  <div className="field">
                    <label htmlFor={fieldId("industry")}>業種</label>
                    {/* 内部値は取込CSV・既存データと同じ英字のまま、表示だけ日本語にする(指示02)。 */}
                    <select
                      id={fieldId("industry")}
                      name="industrySector"
                      defaultValue={entry?.row.industrySector ?? "chemicals"}
                      required
                    >
                      {INDUSTRY_SECTOR_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor={fieldId("type")}>拠点区分</label>
                    <select id={fieldId("type")} name="siteType" defaultValue={entry?.row.siteType ?? "own_site"} required>
                      <option value="own_site">自社拠点</option>
                      <option value="supplier_site">サプライヤー拠点</option>
                    </select>
                  </div>
                </div>
                <div className="field">
                  <label htmlFor={fieldId("location-kind")}>所在地の指定方法</label>
                  <select
                    id={fieldId("location-kind")}
                    name="locationKind"
                    value={locationKind}
                    onChange={(e) => setLocationKind(e.target.value as "coordinates" | "address")}
                  >
                    <option value="coordinates">緯度・経度</option>
                    <option value="address">住所</option>
                  </select>
                </div>
                {locationKind === "coordinates" ? (
                  <div className="field-row">
                    <div className="field">
                      <label htmlFor={fieldId("lat")}>緯度(lat)</label>
                      <input
                        id={fieldId("lat")}
                        name="lat"
                        type="number"
                        step="any"
                        defaultValue={entry?.row.lat ?? ""}
                        required
                      />
                    </div>
                    <div className="field">
                      <label htmlFor={fieldId("lng")}>経度(lng)</label>
                      <input
                        id={fieldId("lng")}
                        name="lng"
                        type="number"
                        step="any"
                        defaultValue={entry?.row.lng ?? ""}
                        required
                      />
                    </div>
                  </div>
                ) : (
                  <div className="field">
                    <label htmlFor={fieldId("address")}>住所</label>
                    <input
                      id={fieldId("address")}
                      name="address"
                      placeholder="例:愛知県名古屋市…"
                      defaultValue={entry?.row.address ?? ""}
                      required
                    />
                  </div>
                )}

                <details style={{ marginTop: 4, border: "1px solid var(--line)", borderRadius: 6, padding: "10px 12px" }}>
                  <summary style={{ cursor: "pointer", fontSize: 12.5, color: "var(--ink-soft)", fontWeight: 500 }}>
                    {editing
                      ? "詳細設定(詳細評価・意思決定・開示。空欄にすると現在の値を維持)"
                      : "詳細設定(詳細評価・意思決定・開示。空欄でデフォルト値を使用)"}
                  </summary>
                  <div style={{ marginTop: 10 }}>
                    <div className="field-row">
                      <div className="field">
                        <label htmlFor={fieldId("physicalQuantity")}>年間水消費量</label>
                        <input
                          id={fieldId("physicalQuantity")}
                          name="physicalQuantity"
                          type="number"
                          step="any"
                          placeholder="10000"
                          defaultValue={deepDive?.physicalQuantity ?? ""}
                        />
                      </div>
                      <div className="field">
                        <label htmlFor={fieldId("unit")}>単位</label>
                        <input id={fieldId("unit")} name="unit" placeholder="m3" defaultValue={deepDive?.unit ?? ""} />
                      </div>
                    </div>
                    <div className="field-row">
                      <div className="field">
                        <label htmlFor={fieldId("unitReplacementCost")}>代替コスト単価(円/単位)</label>
                        <input
                          id={fieldId("unitReplacementCost")}
                          name="unitReplacementCost"
                          type="number"
                          step="any"
                          placeholder="500"
                          defaultValue={deepDive?.unitReplacementCost ?? ""}
                        />
                      </div>
                      <div className="field">
                        <label htmlFor={fieldId("investmentCostInitial")}>対策投資額・初期(円)</label>
                        <input
                          id={fieldId("investmentCostInitial")}
                          name="investmentCostInitial"
                          type="number"
                          step="any"
                          placeholder="20000000"
                          defaultValue={deepDive?.investmentCostInitial ?? ""}
                        />
                      </div>
                    </div>
                    <div className="field-row">
                      <div className="field">
                        <label htmlFor={fieldId("baselineNpvValue")}>投資価値NPV(円)・自然コストを含まない値</label>
                        <input
                          id={fieldId("baselineNpvValue")}
                          name="baselineNpvValue"
                          type="number"
                          step="any"
                          placeholder="500000000"
                          defaultValue={deepDive?.baselineNpvValue ?? ""}
                        />
                      </div>
                      <div className="field">
                        <label htmlFor={fieldId("approvalThresholdValue")}>投資の承認ライン(円)</label>
                        <input
                          id={fieldId("approvalThresholdValue")}
                          name="approvalThresholdValue"
                          type="number"
                          step="any"
                          placeholder="510000000"
                          defaultValue={deepDive?.approvalThresholdValue ?? ""}
                        />
                      </div>
                    </div>
                    <div className="field">
                      <label htmlFor={fieldId("disclosureClaimText")}>開示の記載文(任意。空欄なら自動生成)</label>
                      <input
                        id={fieldId("disclosureClaimText")}
                        name="disclosureClaimText"
                        placeholder="当社は2030年までに…を目指します。"
                        defaultValue={deepDive?.disclosureClaimText ?? ""}
                      />
                    </div>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--ink-soft)" }}>
                      <input
                        name="forcePromote"
                        type="checkbox"
                        defaultChecked={deepDive?.forcePromote ?? true}
                        style={{ width: "auto" }}
                      />
                      詳細評価に進める(M2手動昇格。外すと優先度算定の結果に従う)
                    </label>
                  </div>
                </details>

                {state?.error && <p className="form-error" role="alert">{state.error}</p>}
              </div>
              <div className="modal-foot">
                <button type="button" className="pill-btn" disabled={pending} onClick={() => setOpen(false)}>
                  キャンセル
                </button>
                <button type="submit" className="pill-btn pill-btn--accent" disabled={pending}>
                  {editing
                    ? pending
                      ? "保存中…"
                      : "変更を保存する"
                    : pending
                      ? "登録中…"
                      : "拠点を登録する"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

/** 1件ずつの新規登録(登録タブ)。 */
export function AddSiteForm() {
  return <SiteFormModal />;
}

/** 拠点一覧の行から開く編集モーダル(指示B-03)。 */
export function EditSiteButton({ entry }: { entry: UserSiteEntry }) {
  return <SiteFormModal entry={entry} />;
}
