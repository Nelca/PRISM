# WRI Aqueduct 4.0 Baseline Water Stress メモ

**目的:** `docs/data/acquisition-runbook.md` §3.7(A-9)の成果物。ライセンスの版・帰属表示の書式・Baseline Water Stress(BWS)の公式カテゴリ区分・閾値でのboolean化方針を記録する。
**取得日:** 2026-08-10
**入手先:** `https://files.wri.org/aqueduct/aqueduct-4-0-water-risk-data.zip`(人間がダウンロード・展開)
**確認したファイル:** `Aqueduct40_waterrisk_download_Y2023M07D05/CVS/Aqueduct40_baseline_annual_y2023m07d05.csv`(HydroBASINS Level 6 × 国・州(GADM level 1)クリップ、42,000行規模)、`Aqueduct40_README.xlsx`

---

## 1. ライセンス(§3.7手順2、完了)

**版:** Creative Commons Attribution 4.0 International(CC BY 4.0)。旧記載「Creative Commonsとのみ表記、版不明」は解消。

**確認先:** `https://www.wri.org/aqueduct/faq`

> "Aqueduct's data, products, and methodologies are all available for use under the Creative Commons Attribution International 4.0 License."

**商用利用:** 許可される(CC BY 4.0の一般要件どおり)。

**帰属表示:** WRI公式FAQが示す書式:

> "Source: WRI Aqueduct, accessed on [insert date]"

可能な場合はaqueduct.wri.orgへのリンクを付す。著作権はWRIに留まり、他組織へ譲渡されない。

**PRISMへの対応:** `lib/demo/company.ts`のAqueductデータソース(`dataSource: "WRI Aqueduct 4.0"`)は`licenseMode: "reference_only"`のまま(契約不要・ブロック対象外)で問題ない。ENCORE同様、参照する画面・ドキュメントに上記の帰属表示を付す実装が別途必要(未実装)。

---

## 2. Baseline Water Stressの公式カテゴリ区分(§3.7手順3、完了)

CSVの`bws_cat`/`bws_label`列を実データから直接確認した(技術ノートの記載を転記するより確実)。`bws_raw`(取水量/再生可能水資源量の比)の実測範囲は以下のとおりで、技術ノートの定義と一致する:

| bws_cat | bws_label | bws_raw の範囲 |
|---|---|---|
| -9999 | No Data | (欠測) |
| -1 | Arid and Low Water Use | (取水量が少なすぎて比率が算出されない) |
| 0 | Low (<10%) | 0.000 〜 0.0999 |
| 1 | Low - Medium (10-20%) | 0.1000 〜 0.1999 |
| 2 | Medium - High (20-40%) | 0.2000 〜 0.3996 |
| 3 | High (40-80%) | 0.4003 〜 0.7992 |
| 4 | Extremely High (>80%) | 0.8035 〜 |

**出典:** Kuzma, S. et al. 2023. “Aqueduct 4.0: Updated decision-relevant global water risk indicators.” Technical Note. WRI. doi.org/10.46830/writn.23.00061(README記載の引用。カテゴリ数値自体はCSVから直接確認)。

---

## 3. boolean化の閾値(§3.7手順4、完了)

**採用した閾値:** `bws_cat >= 3`(High、40%以上)を「水ストレス地域」とする。加えて `bws_cat === -1`(Arid and Low Water Use)も水ストレス地域として扱う。

**根拠:** WRIは企業のリスク選定における目安として40%閾値を推奨している(WRI公式ページの記載。私企業が水リスクスクリーニングや目標設定で一般的に採用する基準)。

**実装:** `packages/core/src/site/water-stress.ts`の`isHighBaselineWaterStress()`。`criteria.ts`の構造的既定(数値なら「0より大きければ充足」)は`bws_cat`(0=Lowも正の値)には適用できないため、この専用関数で閾値判定を行う(`NatureInterface.rawResult`に入れる前にboolean化する、という当初の手順4の決定どおり)。

---

## 4. 拠点レベルでの適用方法(正確な地点判定、2026-08-10追記で確定)

**当初の制約(解消済み):** CSVには基準(basin)ポリゴンの幾何情報がなく、`GDB/`フォルダのFile Geodatabaseにのみ収録されている。当初この環境にはGDAL/ogr等の点-in-ポリゴン照会ツールがなく、都道府県/州(GADM level 1、`name_1`列)単位の面積加重多数カテゴリで近似していた。

**解消方法:** サンドボックス内のpipがSSL証明書検証エラーで失敗していたが、サンドボックス外(`dangerouslyDisableSandbox`)から`pip install fiona`を実行したところ成功した(fionaはOpenFileGDBドライバを含むGDALをホイールに同梱しており、システムのlibgdal無しで動作する)。これにより`GDB/Aq40_Y2023D07M05.gdb`の`baseline_annual`レイヤを直接読み込み、拠点座標に対する**厳密なpoint-in-polygon判定**を実行できた。

**厳密な地点判定の結果(2026-08-10、`fiona`+`shapely`):**

| 拠点(デモ) | 座標(lng, lat) | 該当basin(name_0/name_1) | basin面積 | bws_raw | bws_cat/label |
|---|---|---|---|---|---|
| site-042(本社工場) | 136.9, 35.1 | Japan / Aichi | 4,781 km² | 0.300 | 2(Medium-High, 20-40%) |
| site-050(金属加工工場) | 135.5, 34.7 | Japan / Osaka | 1,564 km² | 0.200 | 1(Low-Medium, 10-20%) |
| site-060(海外サプライヤー・繊維) | 72.6, 23.0 | India / Gujarat | 20,120 km² | 6.246 | 4(Extremely High, >80%) |

**都道府県/州単位の面積加重近似との比較:** 3拠点すべてで、厳密な地点判定は近似値(§4旧版:Aichi=cat2・Osaka=cat1・Gujarat=cat4)と**完全に一致した。**近似は妥当だったことが確認できたため、`lib/demo/company.ts`の`BASELINE_WATER_STRESS_CATEGORY`の値は変更していない(近似値=厳密値のため差し替え不要)。

**発見:** 日本国内で面積の過半数が「High(40%以上)」に達する都道府県は無い(最大は兵庫県で面積の7.2%のみ)。すなわち、**日本国内の拠点はAqueductの絶対的な取水比率指標では「水ストレス地域(40%以上)」に該当しにくい。**旧実装の`lookup: () => true`(座標を無視した固定値)は、この実データに反映していなかった。当初のデモ想定(「site-042は水ストレス地域」)は座標を無視した仮の設定であり、実データを反映した結果としてfalseに訂正した。

**対応(2026-08-10、ユーザー判断):** 実データに従いsite-042・site-050のwaterStressをfalseとし、複数基準が該当する実例を別途デモに追加するため、実際にAqueductで「Extremely High」に区分されるインド・グジャラート州(繊維産業の主要産地でもあり、`site-099`(海外サプライヤー・繊維、住所解決失敗のデモ)とは別の、座標が既知で解決に成功する拠点)を`site-060`として追加した。

---

## 5. 今後の改善余地

- 今回の`fiona`によるGDB読み込みはこの調査作業(Pythonスクリプト)限りで行った一回限りの照会であり、PRISMのTypeScript実装(`packages/core`)には組み込んでいない。実データで拠点数が増える場合、都道府県単位ではなく毎回GDBを点-in-ポリゴン照会する仕組み(バックエンドでのGIS処理、または事前に全国のbasin→カテゴリのルックアップテーブルを生成しておく方式)が必要になる。
- `future_annual`(2030/2050/2080の将来投影)・`baseline_monthly`(月次)は未反映。GAP-11のシナリオ差分析と同様、将来の水ストレス変化を評価に反映する場合はこれらのファイルの利用を検討する。
