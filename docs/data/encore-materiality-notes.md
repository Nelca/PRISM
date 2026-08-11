# ENCORE 依存・影響レーティング(Materiality Ratings)メモ

**目的:** `docs/data/acquisition-runbook.md` §3.8(A-10)の成果物。業種別の依存・影響レーティングのデータファイルの内容・ライセンス・boolean化方針を記録する。
**取得日:** 2026-08-10
**入手先:** encorenature.org「Data & Methodology」→「Methodology & Downloads」ページ(無料アカウント登録・ログイン後にダウンロード可能。人間が取得)
**ファイル:** `Updated ENCORE knowledge base May 2026`(zip、17ファイル。CSV 12件・xlsx 5件・PDF 4件)

---

## 1. どのファイルが「業種別の依存・影響レーティング」か

encorenature.orgの「Data & Methodology」配下の10項目のうち、実データファイルは**「Methodology & Downloads」からのダウンロードのみ**。他の9項目(Ecosystem Components / Spatial Data / Mechanisms of Change / Limitations / Materiality Ratings / Economic Activities / Ecosystem Services / Pressures / Value Chains)はいずれも知識モデルの構成要素を閲覧する参照ページで、ダウンロードリンクは無い。「Materiality Ratings」ページ自体もレーティング尺度(VH/H/M/L/VL)の説明にとどまり、データファイルそのものではない。

ダウンロードされた17ファイルのうち、業種別の依存・影響レーティングに相当するのは:

- **`06. Dependency mat ratings.csv`** — ISIC業種 × 生態系サービス(28種)の依存度レーティング(VH〜VL、N/A、ND)
- **`07. Pressure mat ratings.csv`** — ISIC業種 × 圧力(13種)の影響(圧力)レーティング

他ファイルは定義集(`02`,`04`,`10`,`12`)、質的なリンクの根拠(`03`,`05`)、レーティングの内訳詳細(`08`,`09`)、価値鎖(`14`〜`16`)、解説(`01`,`17`)、クロスウォーク表(GICS↔ISIC等)。

---

## 2. ライセンス(既存記録どおり、再確認)

**版:** CC BY-SA 4.0(2026年5月版でも変更なし、`01. Overview - IMPORTANT (READ ME).xlsx`および`Frequently Asked Questions_June2024.pdf` Q17で確認)。`docs/data/licensing.md`のENCOREセクションと一致。

**引用書式(Overviewシートより):**

> ENCORE Partners (Global Canopy, UNEP FI, and UNEP-WCMC) (year). ENCORE: Exploring Natural Capital Opportunities, Risks and Exposure. [On-line], [insert month/year of the version downloaded], Cambridge, UK: ENCORE Partners.
> Available at: https://encorenature.org/en
> DOI: https://doi.org/10.34892/dz3x-y059

**商用利用条件(FAQ Q17):** 商用利用は許可されるが、(1)ENCOREを組み込んで構築したものは同じCC BY-SA 4.0で公開すること、(2)ENCORE Partnersへの帰属表示、の2条件付き。既存の`licensing.md`の記載(D-48:「改変か併存か」の境界は留意事項として記録)と整合。

---

## 3. boolean化の方針

`06`/`07`のレーティングは270業種(ISIC Level 3/4)×28生態系サービス/13圧力の行列で、値はVery High(VH)/High(H)/Medium(M)/Low(L)/Very Low(VL)/N/A(関連なし)/ND(未確定)。

**ENCORE自身は特定の閾値を推奨していない。**`Explanatory Note_June2024.pdf` §2.6:

> "these ratings should only serve to inform initial screening, which should be followed by spatially explicit and company-specific assessments"

**採用した閾値(PRISM側の判断):** 依存度・圧力のいずれかで**High(H)以上のレーティングが1件でもあれば**、TNFD LEAP L3の基準「依存・影響が大きい可能性がある」を満たすとする。Aqueductの40%閾値と異なり、業界標準の数値的閾値が存在しないため、5段階中上位2段階(H・VH)を「大きい可能性がある」とみなす保守的側(false-negativeを避ける方向)の判断。実装は`packages/core/src/site/encore-materiality.ts`の`hasHighMaterialityRating()`。

---

## 4. デモ拠点への適用(2026-08-10)

ISIC業種の対応付け:

| デモの業種 | ISIC Unique code | ISIC分類 |
|---|---|---|
| chemicals(site-042) | C_20_201_2011 | Manufacture of basic chemicals |
| steel(site-050) | C_24_241 | Manufacture of basic iron and steel |
| textile(site-060・site-099) | C_13_131 | Spinning, weaving and finishing of textiles |

各業種のH/VHレーティング(N/A・ND・M以下は省略):

| 拠点 | 依存度(dependency)のH/VH | 圧力(pressure)のH/VH | 判定 |
|---|---|---|---|
| site-042(chemicals) | (なし) | Disturbances(noise, light)=VH、Emissions of toxic soil and water pollutants=VH | **true** |
| site-050(steel) | Water supply=H、Water flow regulation=H | Disturbances=VH、Emissions of GHG=H、Emissions of non-GHG air pollutants=H、Emissions of toxic soil and water pollutants=VH | **true** |
| site-060/099(textile) | Education, scientific and research services=VH | (なし) | **true** |

**発見:** 旧実装では`site-050`(鉄鋼)の`dependency_impact`を`lookup: () => false`(座標・業種を無視した固定値)としていたが、実データでは水供給・水流調整への依存(H)、騒音・GHG・大気汚染物質・有害物質排出の圧力(H/VH)が確認され、**true**に訂正すべきことが判明した。`site-042`(化学)・`site-060`(繊維)は元々`true`だったが、根拠が座標を無視した仮値から実データ引用に変わった。

**留意点(textileのEducation, scientific and research servicesがVHである点):** 一見直感に反するが、CSVの列対応を確認したところデータの取り違えではなく、ENCORE知識ベースが定性評価(Delphi法)で実際に付与した値である。ENCOREの文化的生態系サービス(cultural ecosystem services)は定性評価のみで決定されており(Explanatory Note §2.6)、専門家パネルの判断の結果としてそのまま採用した(独自の解釈で上書きしない)。

---

## 5. 今後の改善余地

- 現在の実装(`lib/demo/company.ts`)は各拠点1つのISIC業種のみを紐づけている。実データでは`SiteRow.industrySector`から実際のISIC分類への変換ロジック(crosswalkの活用含む)が必要になる
- 依存度・圧力を1つのboolean(`likelySignificantDependencyImpact`)に統合しているが、`08. Dependency materiality detail.xlsx`・`09. Pressure materiality detail.xlsx`には内訳(quantitative/qualitative別のスコア)があり、将来的にはM3以降で依存度と圧力を別々の指標として扱う余地がある
