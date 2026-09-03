"use client";

import Link from "next/link";
import { useActionState, useEffect, useId, useRef, useState } from "react";
import type { UserSiteEntry } from "@/lib/demo/site-entry";
import { INDUSTRY_SECTOR_OPTIONS } from "../components/labels";
import { addSiteAction, updateSiteAction, type AddSiteFormState } from "./actions";

const initialState: AddSiteFormState = {};

function SiteFields({
  entry,
  state,
  pending,
  variant,
  onCancel,
}: {
  entry?: UserSiteEntry;
  state: AddSiteFormState;
  pending: boolean;
  variant: "inline" | "modal";
  onCancel?: () => void;
}) {
  const editing = entry !== undefined;
  const deepDive = entry?.deepDive;
  const [locationKind, setLocationKind] = useState<"coordinates" | "address">(
    entry && entry.row.lat === undefined ? "address" : "coordinates"
  );
  const [category, setCategory] = useState<"water" | "climate">(deepDive?.category ?? "water");
  const uid = useId();
  const fieldId = (name: string) => `${uid}-${name}`;
  const quantityLabel = category === "climate" ? "年間GHG排出量" : "年間水消費量";
  const defaultUnit = category === "climate" ? "tCO2e" : "m3";

  return (
    <>
      {editing && <input type="hidden" name="siteId" value={entry.row.id} />}
      <div className={variant === "inline" ? "site-form-grid" : "modal-body"}>
        <div className="field">
          <label htmlFor={fieldId("name")}>拠点名</label>
          <input id={fieldId("name")} name="name" placeholder="例: 名古屋第二工場" defaultValue={entry?.row.name ?? ""} required />
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor={fieldId("industry")}>業種</label>
            <select id={fieldId("industry")} name="industrySector" defaultValue={entry?.row.industrySector ?? "chemicals"} required>
              {INDUSTRY_SECTOR_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
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
          <select id={fieldId("location-kind")} name="locationKind" value={locationKind} onChange={(event) => setLocationKind(event.target.value as "coordinates" | "address")}>
            <option value="coordinates">緯度・経度</option>
            <option value="address">住所</option>
          </select>
        </div>
        {locationKind === "coordinates" ? (
          <div className="field-row">
            <div className="field">
              <label htmlFor={fieldId("lat")}>緯度</label>
              <input id={fieldId("lat")} name="lat" type="number" step="any" defaultValue={entry?.row.lat ?? ""} required />
            </div>
            <div className="field">
              <label htmlFor={fieldId("lng")}>経度</label>
              <input id={fieldId("lng")} name="lng" type="number" step="any" defaultValue={entry?.row.lng ?? ""} required />
            </div>
          </div>
        ) : (
          <div className="field">
            <label htmlFor={fieldId("address")}>住所</label>
            <input id={fieldId("address")} name="address" placeholder="例: 愛知県名古屋市…" defaultValue={entry?.row.address ?? ""} required />
          </div>
        )}

        <fieldset className="site-environment-fields">
          <legend>登録する環境データ</legend>
          <div className="field">
            <label htmlFor={fieldId("category")}>環境データの種類</label>
            <select id={fieldId("category")} name="category" value={category} onChange={(event) => setCategory(event.target.value as "water" | "climate")}>
              <option value="water">水使用量</option>
              <option value="climate">GHG排出量</option>
            </select>
          </div>
          <div className="field-row">
            <div className="field">
              <label htmlFor={fieldId("physicalQuantity")}>{quantityLabel}</label>
              <input
                key={category}
                id={fieldId("physicalQuantity")}
                name="physicalQuantity"
                type="number"
                min="0"
                step="any"
                defaultValue={deepDive?.category === category ? deepDive.physicalQuantity : category === "climate" ? 8000 : 10000}
              />
            </div>
            <div className="field">
              <label htmlFor={fieldId("unit")}>単位</label>
              <input key={category} id={fieldId("unit")} name="unit" placeholder={defaultUnit} defaultValue={deepDive?.category === category ? deepDive.unit : defaultUnit} />
            </div>
          </div>
          <div className="field">
            <label htmlFor={fieldId("unitReplacementCost")}>{category === "climate" ? "内部炭素単価（円/tCO2e）" : "代替コスト単価（円/単位）"}</label>
            <input
              key={category}
              id={fieldId("unitReplacementCost")}
              name="unitReplacementCost"
              type="number"
              min="0"
              step="any"
              defaultValue={deepDive?.category === category ? deepDive.unitReplacementCost : category === "climate" ? 1700 : 500}
            />
          </div>
          {!editing && (
            <p className="site-environment-fields__links">
              汚染物質・廃棄物・土地利用は、必要項目が異なるため<Link href="/sites">専用の取込画面</Link>から登録します。
            </p>
          )}
        </fieldset>

        <details className="site-form-details">
          <summary>投資判断・開示の設定</summary>
          <div className="site-form-details__body">
            <div className="field-row">
              <div className="field">
                <label htmlFor={fieldId("investmentCostInitial")}>対策投資額・初期（円）</label>
                <input id={fieldId("investmentCostInitial")} name="investmentCostInitial" type="number" min="0" step="any" defaultValue={deepDive?.investmentCostInitial ?? 20000000} />
              </div>
              <div className="field">
                <label htmlFor={fieldId("baselineNpvValue")}>投資価値NPV（円）</label>
                <input id={fieldId("baselineNpvValue")} name="baselineNpvValue" type="number" step="any" defaultValue={deepDive?.baselineNpvValue ?? 500000000} />
              </div>
            </div>
            <div className="field">
              <label htmlFor={fieldId("approvalThresholdValue")}>投資の承認ライン（円）</label>
              <input id={fieldId("approvalThresholdValue")} name="approvalThresholdValue" type="number" step="any" defaultValue={deepDive?.approvalThresholdValue ?? 510000000} />
            </div>
            <div className="field">
              <label htmlFor={fieldId("disclosureClaimText")}>開示の記載文（任意）</label>
              <input id={fieldId("disclosureClaimText")} name="disclosureClaimText" placeholder="当社は2030年までに…" defaultValue={deepDive?.disclosureClaimText ?? ""} />
            </div>
            <label className="site-form-checkbox">
              <input name="forcePromote" type="checkbox" defaultChecked={deepDive?.forcePromote ?? true} />
              詳細評価に進める
            </label>
          </div>
        </details>

        {state.error && <p className="form-error" role="alert">{state.error}</p>}
        {state.success && <p className="form-success" role="status">{state.success}</p>}
      </div>

      <div className={variant === "inline" ? "site-form-actions" : "modal-foot"}>
        {variant === "modal" && <button type="button" className="pill-btn" disabled={pending} onClick={onCancel}>キャンセル</button>}
        <button type="submit" className="pill-btn pill-btn--accent" disabled={pending}>
          {pending ? "保存中…" : editing ? "変更を保存する" : "拠点を登録する"}
        </button>
      </div>
    </>
  );
}

function EditSiteModal({ entry }: { entry: UserSiteEntry }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(updateSiteAction, initialState);
  const wasPending = useRef(false);
  const pendingRef = useRef(pending);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    pendingRef.current = pending;
    if (wasPending.current && !pending && !state.error) setOpen(false);
    wasPending.current = pending;
  }, [pending, state]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    const trigger = triggerRef.current;
    document.body.style.overflow = "hidden";
    dialogRef.current?.querySelector<HTMLElement>("button, input, select")?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (!pendingRef.current) setOpen(false);
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), summary, [href], [tabindex]:not([tabindex="-1"])'
      ));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      }
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      trigger?.focus();
    };
  }, [open]);

  return (
    <>
      <button ref={triggerRef} type="button" className="pill-btn pill-btn--sm" onClick={() => setOpen(true)}>編集</button>
      {open && (
        <div className="modal-overlay" onClick={(event) => !pending && event.target === event.currentTarget && setOpen(false)}>
          <div ref={dialogRef} className="modal-card" role="dialog" aria-modal="true" aria-labelledby={titleId}>
            <div className="modal-head">
              <div><h3 id={titleId}>拠点を編集</h3><p>保存すると再計算され、変更の内容は記録に残ります</p></div>
              <button type="button" className="modal-close" aria-label="閉じる" disabled={pending} onClick={() => setOpen(false)}>✕</button>
            </div>
            <form action={formAction}>
              <SiteFields entry={entry} state={state} pending={pending} variant="modal" onCancel={() => setOpen(false)} />
            </form>
          </div>
        </div>
      )}
    </>
  );
}

/** 1件ずつの新規登録は、追加操作を挟まずページ内に直接表示する。 */
export function AddSiteForm() {
  const [state, formAction, pending] = useActionState(addSiteAction, initialState);
  return <form action={formAction} className="site-form-inline"><SiteFields state={state} pending={pending} variant="inline" /></form>;
}

export function EditSiteButton({ entry }: { entry: UserSiteEntry }) {
  return <EditSiteModal entry={entry} />;
}
