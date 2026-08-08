"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { addSiteAction, type AddSiteFormState } from "./actions";

const initialState: AddSiteFormState = {};

export function AddSiteForm() {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(addSiteAction, initialState);
  const [locationKind, setLocationKind] = useState<"coordinates" | "address">("coordinates");
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending && !state.error) {
      setOpen(false);
    }
    wasPending.current = pending;
  }, [pending, state]);

  return (
    <>
      <button type="button" className="pill-btn pill-btn--accent" onClick={() => setOpen(true)}>
        拠点を追加
      </button>

      {open && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div className="modal-card">
            <div className="modal-head">
              <div>
                <h3>拠点を追加</h3>
                <p>登録すると、周辺環境との関係を確認し感応度スコアを算定します</p>
              </div>
              <button type="button" className="modal-close" aria-label="閉じる" onClick={() => setOpen(false)}>
                ✕
              </button>
            </div>
            <form action={formAction}>
              <div className="modal-body">
                <div className="field">
                  <label htmlFor="site-name">拠点名</label>
                  <input id="site-name" name="name" placeholder="例:名古屋第二工場" required />
                </div>
                <div className="field-row">
                  <div className="field">
                    <label htmlFor="site-industry">業種</label>
                    <input id="site-industry" name="industrySector" placeholder="例: chemicals" required />
                  </div>
                  <div className="field">
                    <label htmlFor="site-type">拠点区分</label>
                    <select id="site-type" name="siteType" defaultValue="own_site" required>
                      <option value="own_site">自社拠点</option>
                      <option value="supplier_site">サプライヤー拠点</option>
                    </select>
                  </div>
                </div>
                <div className="field">
                  <label htmlFor="site-location-kind">所在地の指定方法</label>
                  <select
                    id="site-location-kind"
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
                      <label htmlFor="site-lat">緯度(lat)</label>
                      <input id="site-lat" name="lat" type="number" step="any" required />
                    </div>
                    <div className="field">
                      <label htmlFor="site-lng">経度(lng)</label>
                      <input id="site-lng" name="lng" type="number" step="any" required />
                    </div>
                  </div>
                ) : (
                  <div className="field">
                    <label htmlFor="site-address">住所</label>
                    <input id="site-address" name="address" placeholder="例:愛知県名古屋市…" required />
                  </div>
                )}

                <details style={{ marginTop: 4, border: "1px solid var(--line)", borderRadius: 6, padding: "10px 12px" }}>
                  <summary style={{ cursor: "pointer", fontSize: 12.5, color: "var(--ink-soft)", fontWeight: 500 }}>
                    詳細設定(深掘り評価・意思決定・開示。空欄でデフォルト値を使用)
                  </summary>
                  <div style={{ marginTop: 10 }}>
                    <div className="field-row">
                      <div className="field">
                        <label htmlFor="physicalQuantity">年間水消費量</label>
                        <input id="physicalQuantity" name="physicalQuantity" type="number" step="any" placeholder="10000" />
                      </div>
                      <div className="field">
                        <label htmlFor="unit">単位</label>
                        <input id="unit" name="unit" placeholder="m3" />
                      </div>
                    </div>
                    <div className="field-row">
                      <div className="field">
                        <label htmlFor="unitReplacementCost">代替コスト単価(円/単位)</label>
                        <input id="unitReplacementCost" name="unitReplacementCost" type="number" step="any" placeholder="500" />
                      </div>
                      <div className="field">
                        <label htmlFor="investmentCostInitial">対策投資額・初期(円)</label>
                        <input id="investmentCostInitial" name="investmentCostInitial" type="number" step="any" placeholder="20000000" />
                      </div>
                    </div>
                    <div className="field-row">
                      <div className="field">
                        <label htmlFor="baselineNpvValue">通常時NPV(円)</label>
                        <input id="baselineNpvValue" name="baselineNpvValue" type="number" step="any" placeholder="500000000" />
                      </div>
                      <div className="field">
                        <label htmlFor="approvalThresholdValue">承認閾値(円)</label>
                        <input id="approvalThresholdValue" name="approvalThresholdValue" type="number" step="any" placeholder="510000000" />
                      </div>
                    </div>
                    <div className="field">
                      <label htmlFor="disclosureClaimText">開示claim文(任意。空欄なら自動生成)</label>
                      <input id="disclosureClaimText" name="disclosureClaimText" placeholder="当社は2030年までに…を目指します。" />
                    </div>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--ink-soft)" }}>
                      <input name="forcePromote" type="checkbox" defaultChecked style={{ width: "auto" }} />
                      深掘り評価に進める(M2手動昇格。外すと優先度算定の結果に従う)
                    </label>
                  </div>
                </details>

                {state?.error && <p className="form-error">{state.error}</p>}
              </div>
              <div className="modal-foot">
                <button type="button" className="pill-btn" onClick={() => setOpen(false)}>
                  キャンセル
                </button>
                <button type="submit" className="pill-btn pill-btn--accent" disabled={pending}>
                  {pending ? "登録中…" : "拠点を登録する"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
