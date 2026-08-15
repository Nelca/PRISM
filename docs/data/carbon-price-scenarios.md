# 炭素価格シナリオ(M5 D-4.2)の一次資料確認状況

**目的:** M5 D-4.2が「未確認事項(実装前に一次資料で再確認すること)」として残した2点 —— NGFSの価格軌道と、GX-ETSの価格 —— の取得状況を記録する。GAP-11(`docs/requirements/mvp-completion-gap.md`)の前提データ。
**参照元:** `docs/requirements/m5-financial-bridge.md` §4.2
**取得日:** 2026-08-08 / **GX-ETS一次資料取得日:** 2026-08-10 / **NGFS取得日:** 2026-08-15
**status:** **GAP-11は解消済み(2026-08-15)。**NGFS・GX-ETSともに取得完了(§1・§2)、`computeNatureDebt()`への接続・実証(site-070、GAP-14で追加した気候プラグインの初めての接続)まで完了(§4、design-rationale-log D-128)。

---

## 0. 判定

| シナリオ | 必要なもの | 状態 |
|---|---|---|
| NGFS Net Zero 2050(Orderly) | 2030/2040/2050の炭素価格軌道(モデル・実質基準年つき) | **取得完了。**§1 |
| NGFS Current Policies | 同上 | **取得完了。**§1 |
| GX-ETS公式価格帯 | 参考上限取引価格・調整基準取引価格・年次改定率 | **一次資料取得完了。**§2 |

**実装への含意:** 2026-08-15、`computeNatureDebt()`のシナリオ別拡張・気候カテゴリの拠点(site-070)追加・実際の数値差の確認まで完了した(§4)。GAP-11は解消済み。

---

## 1. NGFS【2026-08-15 取得完了】

**入手経緯:** 人間がIIASA Scenario Explorer(`data.ene.iiasa.ac.at/ngfs`)からNGFS Climate Scenarios Data Set **v5.1**(2026-03-20リリース、Zenodo doi:10.5281/zenodo.17901363)のzipをダウンロード・展開した(ゲストアクセス、追加登録不要)。`IAM_data.xlsx`(全モデル・全シナリオ・全地域の統合ファイル)から必要な行を抽出した。

**確定した数値:** `Price|Carbon`変数、**単位はUS$2010/t CO2(2010年基準の実質米ドル)**。

**モデル間の乖離(重要な判断・D-127参照):** 同じシナリオでもモデルによって数値が大きく異なる(2050年Net Zero 2050・日本:GCAM $1,350 vs REMIND-MAgPIE $709)。加えてMESSAGEix-GLOBIOMは日本単体の内訳を持たない(「Pacific OECD」への集約のみ)。**[HUMAN判断・2026-08-15]単一モデルを選ばず、GCAMとREMIND-MAgPIEの両方を幅(レンジ)として製品に反映する**方針とした。NGFS自身も「複数モデル間の幅として読むべきで、単一の値を正解として扱うべきではない」という立場を取っている。

**採用する2モデルの価格軌道(消費国=日本、World、US$2010/tCO2):**

| モデル | シナリオ | 地域 | 2025 | 2030 | 2035 | 2040 | 2045 | 2050 |
|---|---|---|---|---|---|---|---|---|
| GCAM 6.0 NGFS | Current Policies | Japan | 0 | 0 | 0 | 0 | 0 | 0 |
| REMIND-MAgPIE 3.3-4.8 | Current Policies | Japan | 16.84 | 16.98 | 17.19 | 17.50 | 17.89 | 18.38 |
| GCAM 6.0 NGFS | Current Policies | World | 0 | 0 | 0 | 0 | 0 | 0 |
| REMIND-MAgPIE 3.3-4.8 | Current Policies | World | 10.69 | 10.30 | 10.16 | 10.25 | 10.59 | 11.13 |
| GCAM 6.0 NGFS | Net Zero 2050 | Japan | 11.54 | 85.83 | 196.34 | 366.97 | 651.93 | 1350.12 |
| REMIND-MAgPIE 3.3-4.8 | Net Zero 2050 | Japan | 153.20 | 283.70 | 414.20 | 544.70 | 675.20 | 708.80 |
| GCAM 6.0 NGFS | Net Zero 2050 | World | 12.45 | 102.02 | 198.31 | 336.75 | 658.87 | 1260.07 |
| REMIND-MAgPIE 3.3-4.8 | Net Zero 2050 | World | 98.38 | 183.30 | 294.95 | 433.77 | 614.37 | 748.80 |

全データ(生値・年次2020〜2100含む)は`docs/data/external/ngfs-phase5.1-carbon-price-gcam-remind.csv`。抽出元:`IAM_data.xlsx`(v5.1 zip内)。

**Current Policiesの解釈上の注意:** GCAMはCurrent Policiesシナリオで一貫して$0を返す(このシナリオ分岐に明示的な炭素価格メカニズムを持たない構造上の理由。「炭素価格ゼロが将来予測として正しい」という意味ではない)。REMIND-MAgPIEの$11〜18という値の方が、現実の炭素価格の実態に近い。**Current Policiesのレンジ下限が$0になる点は、UI表示時に「モデル差」であることを明示する必要がある**(D-127)。

**ライセンス:** NGFS Phase 5 license(CC BY 4.0ベースの独自ライセンス)。商用利用は許可されるが、「実質的な部分の複製・再配布」は禁止。`docs/data/licensing.md`に転記予定(未実施)。

**日本の地域粒度についての注意:** GCAM・REMIND-MAgPIEとも日本を独立モデル地域として最適化しているわけではなく、それぞれの地域集約(GCAM 32地域 / REMIND-MAgPIE R12)から統計的にダウンスケーリングされた値。この手法由来の不確実性は、モデル間の差とは別に存在する。

**→ 元の取得手順は `acquisition-runbook.md` §3.2(完了済み、履歴として残す)。**

---

## 2. GX-ETS【2026-08-10 一次資料取得完了】

**一次資料:** 「令和8年度の参考上限取引価格及び調整基準取引価格に関する意見」、産業構造審議会 イノベーション・環境分科会 排出量取引制度小委員会、令和7年12月19日。
`https://www.meti.go.jp/shingikai/sankoshin/sangyo_gijutsu/emissions_trading/pdf/20251219_2.pdf`(METI公式サイト。WebFetchツールは403で拒否されたが、ブラウザ相当のUser-Agentを付けた直接リクエストで取得できた)

**確定した数値(一次資料原文より):**

| 項目 | 値 | 対象年度 |
|---|---|---|
| 参考上限取引価格 | **4,300円**/一の脱炭素成長型投資事業者排出枠(CO2 1トン相当) | 令和8年度(2026年度) |
| 調整基準取引価格 | **1,700円**/同上 | 令和8年度(2026年度) |

**改定ルールの正確な定義(原文どおり):**

> 「令和９年度から令和１２年度までの参考上限取引価格及び調整基準取引価格については、前年度の価格に、当該年度の物価の変動指数の見通しの数値に１．０３を加えたものを乗じた価格を基礎として、法第３９条第１項及び第１１６条第１項の規定に基づき毎年度定めていくこととする。」

**判明した重要な訂正・補足:**
1. **改定は「以降」ではなく令和9年度(2027年度)〜令和12年度(2030年度)の4年間に限定される。**二次資料の「2027年度以降」という表現は不正確(この意見が対象とする期間を過ぎた後の改定方式は、この文書には記載がない)
2. **改定式は「前年度価格 ×(当該年度の物価変動指数の見通し + 1.03)」であり、二次資料が言う「実質3%」はこの式の言い換えとして正確**(物価変動指数の見通しがゼロに近い場合、名目の掛け率はおよそ1.03=実質3%相当になる、という意味)。ただし「物価変動指数の見通し」自体が具体的にどの指標(CPI等)を指すかは、この文書には明記がない(引用元の法令(脱炭素成長型経済構造への円滑な移行の推進に関する法律 第39条第1項・第116条第1項)を別途確認する必要がある)
3. 令和8年度単年の価格自体は二次資料と完全一致していた(¥4,300 / ¥1,700)

**M5要件定義書の記載との照合:** M5 D-4.2が記録している数値(¥4,300 / ¥1,700)と一致。**改定ルールの正確な定義という当初の未確認事項は、この一次資料により解消した**(ただし上記2の「物価変動指数の見通し」の指標名は依然未確定)。

---

## 3. 実装に落とすときの形(取得後の作業)

取得が完了したら、以下の形で登録する。**数値をコードに直接書かない。**

```
VersionedParameterSet {
  setId: "carbon-price-scenarios"
  version: "v1"
  effectiveFrom: <確認日>
  changeReason: <初版のため不要。更新時は必須>
}
```

シナリオ別の価格軌道(年 × シナリオ × 価格 × 通貨 × 実質基準年)を別データとして保持し、`computeNatureDebt()` がシナリオ別の未内部化コストを算出できるように拡張する(GAP-11)。**通貨と実質基準年を値と一体で保持すること**(NGFSはUSD実質、GX-ETSは円名目であり、混ぜると意味をなさない)。

**2026-08-15追記(型設計・コード反映、D-127):** [HUMAN判断]シナリオラベルをモデル別に分ける方式を採用した。実装済み:

1. `CarbonPriceScenario`を3値→5値に拡張(`ngfs_net_zero_2050_gcam` / `ngfs_net_zero_2050_remind` / `ngfs_current_policies_gcam` / `ngfs_current_policies_remind` / `gx_ets_official`)。既存の`InternalizationProbability[]`・`NatureDebt.breakdown`(配列)はそのまま、要素が5種類に増えるだけで型変更は不要だった
2. `computeNatureDebt()`に第4引数`uninternalizedCostByScenario?: Partial<Record<CarbonPriceScenario, ExchangeAmount>>`を追加(省略時は従来どおり全シナリオ共通の第1引数を使う、後方互換)
3. NGFS軌道の生データを`packages/core/src/financial-bridge/carbon-price-trajectory.ts`に定数として格納(`lookupNgfsCarbonPrice()`)
4. `lib/demo/run-demo-pipeline.ts`のデフォルト内部化確率を5シナリオ均等割り(各1/5)に変更
5. **2026-08-15追記(USD→円換算、[HUMAN確認]):** 米国GDPデフレータ(`NY.GDP.DEFL.ZS`、2010年=85.06→2025年=122.36)で実質2010年USDを2025年USDに補正し、2025年の円/ドル為替レート(`PA.NUS.FCRF`、期中平均149.66円)を掛ける2段階の換算係数を`NGFS_USD_TO_JPY_CALIBRATION`(`carbon-price-trajectory.ts`)として定数化した。`jpyPerNgfsUsd2010()` / `convertNgfsPriceToJpy()`で利用できる。**年が変わるたびに更新が必要な値のため、他の較正値から独立した定数として持ち、差し替えやすくしてある**(PPP係数(94.46円)とは別物、混同しないこと)。出典・値は`NGFS_USD_TO_JPY_CALIBRATION`のコード内コメント参照。

**2026-08-15追記(気候カテゴリ拠点の追加・完全解消、D-128):** 上記の型・API拡張だけでは、`computeNatureDebt()`に渡す交換価値レコードが常に`${siteId}-mi-water`(水カテゴリ)から取られており(`representativeRecordForSite()`)、気候カテゴリのMaterialIssueがデモに一度も存在しないため、GAP-14で追加した`ghg-carbon-price-conversion.ts`が実際にはどの拠点にも配線されていないことが判明した。以下を実装してGAP-11を完全に解消した:

1. 気候カテゴリ専用の新規拠点`site-070`(四日市工場)を追加し、`representativeRecordForSite()`のハードコードを一般化(カテゴリを問わず`promoted`から実際の代表レコードを引く形に変更)
2. `site-070`の交換価値レコード(`ghg-carbon-price-conversion.ghg-gx-ets-price`)に対して、NGFS軌道(2030年、GCAM/REMIND-MAgPIE)× 為替換算 × 8,000 tCO2e − 既internalizedコストで、実際にシナリオ別の`uninternalizedCostByScenario`を算出
3. **地理較正の副作用を修正(重要な副産物):** 較正(PPP等)が1つのMaterialIssueの全プラグイン出力に一律適用される設計だったため、`replacement-cost`(円建て、PPP不要)が`lime3-water`/`ifvi-*`(USD建て)と同じ較正を共有しており、**site-042の代替費用がPPP係数(94.46)分だけ誤って膨張していたことが判明した**(既存のテストはこの実際の較正を経由しない固定値・恒等較正のみを使っていたため気づかれていなかった)。`MethodOutput.skipGeographicCalibration`を追加し、`replacement-cost.ts`と`ghg-carbon-price-conversion.ts`のGX-ETS価格出力に適用して修正した

**実際に算出された数値(site-070、2030年時点、物理量8,000 tCO2e):**

| シナリオ | 割引後の自然債務寄与分(円) |
|---|---|
| GCAM Current Policies | -298,903(炭素価格ゼロのため既internalizedコストが上回る) |
| REMIND-MAgPIE Current Policies | 4,070,485 |
| GX-ETS公式価格(基準) | 1,733,639 |
| GCAM Net Zero 2050 | 21,793,470 |
| REMIND-MAgPIE Net Zero 2050 | 72,725,081 |

**GAP-11の完了条件(シナリオ間で自然債務の値が実際に異なる)を数値で満たしていることを`gate-verification.test.ts`で検証済み。** 詳細はdesign-rationale-log D-128。
